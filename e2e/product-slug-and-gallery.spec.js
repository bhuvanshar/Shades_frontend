const { test, expect } = require("@playwright/test");
const { ApiClient, createCustomer, sqlValue } = require("./support/api");
const { admin, createProduct, disguisedFile, imageFile, imageRowsOf, uploadImage } = require("./support/fixtures");
const { observe, clean } = require("./support/observe");
const { submitSignIn } = require("./support/ui");

/**
 * Public product URLs and the product image gallery, end to end against the real backend, a real
 * MySQL schema and real files on disk. Nothing here is mocked.
 *
 * Two changes are under test:
 *   1. /product/22 (the sequential PRODUCT_ID) became /product/{slug}, with the old numeric form
 *      redirecting to the canonical one.
 *   2. PRODUCT_IMAGES gained a real VARIANT_ID column, an ordering guarantee and a one-primary-
 *      per-product database constraint; the storefront gained a gallery that can actually reach
 *      every photo, including on a phone.
 */

const CLEAN = { consoleErrors: [], pageErrors: [], dialogs: [], badResponses: [] };

const money = (value) => Number(value);

/** A product with two colourways and photos: one general, one per variant. */
const productWithGallery = async (label) => {
  const product = await createProduct({
    name: `E2E Gallery ${label} ${Date.now()}`,
    variants: [
      { sku: `GAL-${label}-A-${Date.now()}`, variantName: "Blue", color: "Blue", price: money(1500), quantityAvailable: 5 },
      { sku: `GAL-${label}-B-${Date.now()}`, variantName: "Orange", color: "Orange", price: money(1700), quantityAvailable: 4 },
    ],
  });
  const [blue, orange] = product.variants;
  const general = await uploadImage({ productId: product.productId, altText: "Studio shot", displayOrder: 0, isPrimary: true });
  // TWO photos per colourway. A variant's gallery is its own photos only — the general shot is a
  // fallback for colourways that have none, not an extra frame appended to every gallery — so a
  // colourway needs more than one of its own before there is anything to page through.
  const blueShot = await uploadImage({ productId: product.productId, variantId: blue.variantId, altText: "Blue colourway", displayOrder: 0 });
  await uploadImage({ productId: product.productId, variantId: blue.variantId, altText: "Blue colourway detail", displayOrder: 1 });
  const orangeShot = await uploadImage({ productId: product.productId, variantId: orange.variantId, altText: "Orange colourway", displayOrder: 0 });
  await uploadImage({ productId: product.productId, variantId: orange.variantId, altText: "Orange colourway detail", displayOrder: 1 });
  return { ...product, blue, orange, general, blueShot, orangeShot };
};

// ── Security ──────────────────────────────────────────────────────────────────────────────

test("an unknown slug is a clean not-found, not a server error or a blank page", async ({ page }) => {
  const seen = observe(page);
  await page.goto("/product/no-such-product-anywhere-xyz");
  await expect(page.getByRole("heading", { name: "Product not found" })).toBeVisible();
  // The 404 IS the expected answer here, so badResponses is allowed to hold exactly that one and
  // nothing else. Asserting the whole object empty would be wrong; asserting nothing would let a
  // real error through.
  const observed = clean(seen);
  expect(observed.pageErrors).toEqual([]);
  expect(observed.dialogs).toEqual([]);
  expect(observed.badResponses.filter((entry) => !/products\/slug\/no-such-product/.test(String(entry)))).toEqual([]);
});

test("a legacy numeric product URL redirects to the canonical slug", async ({ page }) => {
  const product = await productWithGallery("redirect");
  await page.goto(`/product/${product.productId}`);
  // The canonical address replaces the numeric one — the numeric form must not remain in the bar.
  await expect(page).toHaveURL(new RegExp(`/product/${product.slug}$`));
  await expect(page.getByRole("heading", { level: 1, name: product.name })).toBeVisible();
  expect(page.url()).not.toContain(`/product/${product.productId}`);
});

test("an invalid numeric product id is not found and leaks nothing about the catalogue", async ({ page }) => {
  const seen = observe(page);
  await page.goto("/product/99999999");
  await expect(page.getByRole("heading", { name: "Product not found" })).toBeVisible();
  const observed = clean(seen);
  expect(observed.pageErrors).toEqual([]);
  expect(observed.dialogs).toEqual([]);
  expect(observed.badResponses.filter((entry) => !/products\/99999999\/canonical/.test(String(entry)))).toEqual([]);
});

test("the public product response carries a slug and never a bare database id in the URL", async () => {
  const product = await productWithGallery("public-fields");
  const client = new ApiClient();
  const response = await client.get(`/products/slug/${product.slug}`);
  expect(response.slug).toBe(product.slug);
  // Images expose a public identifier and their real variant column, not a path-derived guess.
  for (const image of response.images) {
    expect(image.publicId).toMatch(/^[0-9a-f-]{36}$/);
  }
  const variantIds = response.images.map((image) => image.variantId).filter(Boolean);
  expect(variantIds).toContain(product.blue.variantId);
});

test("image management endpoints refuse a guest and a signed-in customer alike", async () => {
  const product = await productWithGallery("authz");
  const imageId = product.general.imageId;
  const guest = new ApiClient();
  const customer = await createCustomer("img-authz");

  for (const [label, client] of [["guest", guest], ["customer", customer.client]]) {
    for (const attempt of [
      () => client.put(`/products/${product.productId}/images/order`, [imageId]),
      () => client.put(`/products/${product.productId}/images/${imageId}/primary`, undefined),
      () => client.patch(`/products/${product.productId}/images/${imageId}`, { altText: "hijacked" }),
      () => client.del(`/products/${product.productId}/images/${imageId}`),
    ]) {
      const error = await attempt().then(() => null, (failure) => failure);
      expect(error, `${label} must be refused`).toBeTruthy();
      expect([401, 403], `${label} got ${error.status}`).toContain(error.status);
    }
  }
  // And nothing changed: the alt text an admin set is still there.
  expect(imageRowsOf(product.productId).join("|")).toContain("Studio shot");
});

test("an admin cannot reach another product's image by changing the id in the path", async () => {
  const mine = await productWithGallery("idor-a");
  const theirs = await productWithGallery("idor-b");
  const account = await admin();

  // The image exists and this caller is a legitimate admin — but it does not belong to the product
  // named in the path, so it must be refused rather than silently edited.
  const patch = await account.client
    .patch(`/products/${mine.productId}/images/${theirs.general.imageId}`, { altText: "cross-product write" })
    .then(() => null, (failure) => failure);
  expect(patch).toBeTruthy();
  expect(patch.status).toBe(404);

  const reorder = await account.client
    .put(`/products/${mine.productId}/images/order`, [theirs.general.imageId])
    .then(() => null, (failure) => failure);
  expect(reorder).toBeTruthy();
  expect(reorder.status).toBe(400);

  expect(imageRowsOf(theirs.productId).join("|")).not.toContain("cross-product write");
});

// ── Upload validation ─────────────────────────────────────────────────────────────────────

test("an HTML file renamed .png is rejected by content, not accepted on its extension", async () => {
  const product = await productWithGallery("disguised");
  const before = imageRowsOf(product.productId).length;
  const failure = await uploadImage({
    productId: product.productId, file: disguisedFile(), contentType: "image/png",
  }).then(() => null, (error) => error);
  expect(failure, "a disguised file must not be stored").toBeTruthy();
  expect(failure.status).toBe(400);
  expect(imageRowsOf(product.productId).length).toBe(before);
});

test("the per-product image limit is enforced by the server and reported, not silently applied", async () => {
  const product = await productWithGallery("limit");
  const limit = 10;
  // Three already exist; fill to the limit, then prove the next one is refused.
  for (let index = imageRowsOf(product.productId).length; index < limit; index += 1) {
    await uploadImage({ productId: product.productId, altText: `Filler ${index}`, displayOrder: index });
  }
  expect(imageRowsOf(product.productId).length).toBe(limit);
  const failure = await uploadImage({ productId: product.productId, altText: "one too many" })
    .then(() => null, (error) => error);
  expect(failure).toBeTruthy();
  expect(failure.status).toBe(400);
  expect(failure.message).toContain(String(limit));
  expect(imageRowsOf(product.productId).length).toBe(limit);
});

// ── Ordering and the primary image ────────────────────────────────────────────────────────

test("reordering persists, and the primary image stays first however the order is set", async () => {
  const product = await productWithGallery("order");
  const account = await admin();
  const ids = imageRowsOf(product.productId).map((row) => Number(row.split(":")[0]));

  const reversed = [...ids].reverse();
  await account.client.put(`/products/${product.productId}/images/order`, reversed);

  const after = imageRowsOf(product.productId);
  // Primary first is the rule, so the reversal shows up among the non-primary images.
  expect(after[0].split(":")[2]).toBe("1");
  const ordersById = Object.fromEntries(after.map((row) => {
    const [id, order] = row.split(":");
    return [Number(id), Number(order)];
  }));
  reversed.forEach((id, position) => expect(ordersById[id]).toBe(position));
});

test("promoting a new primary demotes the old one instead of hitting the unique constraint", async () => {
  // UQ_PRODUCT_IMAGES_PRIMARY makes "primary for product N" unique, so the swap has to demote
  // before it promotes. Doing it in the wrong order is a 409, not a wrong answer — which is
  // exactly why this is worth an end-to-end test rather than trusting the service code.
  const product = await productWithGallery("primary-swap");
  const account = await admin();
  const target = product.blueShot.imageId;

  await account.client.put(`/products/${product.productId}/images/${target}/primary`, undefined);

  const rows = imageRowsOf(product.productId);
  const primaries = rows.filter((row) => row.split(":")[2] === "1");
  expect(primaries).toHaveLength(1);
  expect(Number(primaries[0].split(":")[0])).toBe(target);
});

test("removing the primary image promotes the next one rather than leaving none", async () => {
  const product = await productWithGallery("primary-removal");
  const account = await admin();
  // Derived, not a literal: the fixture's image count is an implementation detail of
  // productWithGallery, and hard-coding it made this test fail when a colourway gained a second
  // photo — for a reason that had nothing to do with primary-image promotion.
  const before = imageRowsOf(product.productId).length;
  await account.client.del(`/products/${product.productId}/images/${product.general.imageId}`);

  const rows = imageRowsOf(product.productId);
  expect(rows).toHaveLength(before - 1);
  expect(rows.filter((row) => row.split(":")[2] === "1")).toHaveLength(1);
});

// ── Customer flow in the browser ──────────────────────────────────────────────────────────

test("a customer reaches the product by slug, browses the gallery and buys the selected variant", async ({ page }) => {
  const product = await productWithGallery("customer");
  const seen = observe(page);

  await page.goto(`/product/${product.slug}`);
  await expect(page).toHaveURL(new RegExp(`/product/${product.slug}`));
  expect(page.url()).not.toMatch(new RegExp(`/product/${product.productId}\\b`));

  const gallery = page.locator(".pg");
  await expect(gallery).toBeVisible();
  const mainImage = page.locator(".pg-frame img");

  // Blue is the default variant: its own two photos, then the general studio shot. Derived from
  // the fixture rather than written as a literal, so changing what productWithGallery uploads
  // cannot fail this test for a reason unrelated to what it is checking.
  const blueOwn = imageRowsOf(product.productId).filter((row) => row.split(":")[3] === String(product.blue.variantId)).length;
  const generalCount = imageRowsOf(product.productId).filter((row) => row.split(":")[3] === "-").length;
  await expect(page.getByRole("button", { name: /^Show photo/ })).toHaveCount(blueOwn + generalCount);
  const firstSrc = await mainImage.getAttribute("src");

  // Next moves, and does NOT reload the page — a gallery control inside a form would submit it.
  await page.evaluate(() => { window.__stillHere = true; });
  await page.getByRole("button", { name: "Next photo" }).click();
  await expect(mainImage).not.toHaveAttribute("src", firstSrc);
  expect(await page.evaluate(() => window.__stillHere)).toBe(true);

  // Keyboard navigation returns to the first photo.
  await gallery.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(mainImage).toHaveAttribute("src", firstSrc);

  // Switching colourway shows that colourway's photo...
  await page.getByRole("button", { name: new RegExp(`${product.name} Orange`) }).click();
  await expect(mainImage).toHaveAttribute("src", /.+/);
  const orangeSrc = await mainImage.getAttribute("src");
  expect(orangeSrc).toContain(`/variants/${product.orange.variantId}/`);

  // ...and Add to Bag commits THAT variant, not the one whose photo happens to be showing.
  await page.getByRole("button", { name: /Add Orange to bag/ }).click();
  await expect(page.getByRole("link", { name: /View bag/ })).toBeVisible();

  expect(clean(seen), "the page must be clean").toEqual(CLEAN);
});

test("refresh and browser Back/Forward keep the slug URL working", async ({ page }) => {
  const first = await productWithGallery("nav-a");
  const second = await productWithGallery("nav-b");

  await page.goto(`/product/${first.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: first.name })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: first.name })).toBeVisible();

  await page.goto(`/product/${second.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: second.name })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/product/${first.slug}`));
  await expect(page.getByRole("heading", { level: 1, name: first.name })).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/product/${second.slug}`));
  await expect(page.getByRole("heading", { level: 1, name: second.name })).toBeVisible();
});

test("the canonical link tag points at the slug URL", async ({ page }) => {
  const product = await productWithGallery("canonical");
  await page.goto(`/product/${product.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: product.name })).toBeVisible();
  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(canonical).toContain(`/product/${product.slug}`);
  expect(canonical).not.toContain(`/product/${product.productId}`);
});

test("a product with a single photo shows no dead navigation controls", async ({ page }) => {
  const product = await createProduct({
    name: `E2E One Photo ${Date.now()}`,
    variants: [{ sku: `ONE-${Date.now()}`, variantName: "Black", color: "Black", price: money(999), quantityAvailable: 2 }],
  });
  await uploadImage({ productId: product.productId, altText: "Only photo", isPrimary: true });

  await page.goto(`/product/${product.slug}`);
  await expect(page.locator(".pg-frame img")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next photo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Previous photo" })).toHaveCount(0);
});

test("a product with no photos renders an empty frame rather than a broken image", async ({ page }) => {
  const product = await createProduct({
    name: `E2E No Photo ${Date.now()}`,
    variants: [{ sku: `NONE-${Date.now()}`, variantName: "Black", color: "Black", price: money(999), quantityAvailable: 2 }],
  });
  const seen = observe(page);
  await page.goto(`/product/${product.slug}`);
  await expect(page.getByTestId("product-gallery-empty")).toBeVisible();
  expect(clean(seen), "the page must be clean").toEqual(CLEAN);
});

// ── Out-of-stock colourways must not supply the photography ───────────────────────────────

test("the gallery shows an in-stock colourway's photos, not a sold-out one's", async ({ page }) => {
  // The reported bug: the page said "Add Orange to bag" beside two photographs of a sold-out Blue,
  // because every image fallback ended at "the primary image, else the first image" without asking
  // whether that photo's variant could be bought. Blue owns the PRIMARY photo here, which is what
  // made it win.
  const product = await createProduct({
    name: `E2E OOS Photos ${Date.now()}`,
    variants: [
      { sku: `OOSP-B-${Date.now()}`, variantName: "Blue", color: "Blue", price: money(1500), quantityAvailable: 0 },
      { sku: `OOSP-O-${Date.now()}`, variantName: "Orange", color: "Orange", price: money(1500), quantityAvailable: 5 },
      { sku: `OOSP-G-${Date.now()}`, variantName: "Green", color: "Green", price: money(1500), quantityAvailable: 7 },
    ],
  });
  const [blue, , green] = product.variants;
  await uploadImage({ productId: product.productId, variantId: blue.variantId, altText: "Blue photo", isPrimary: true });
  await uploadImage({ productId: product.productId, variantId: green.variantId, altText: "Green photo" });

  await page.goto(`/product/${product.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: product.name })).toBeVisible();

  // Orange is selected (first purchasable) and has no photography of its own.
  await expect(page.locator(".pd-variant-label strong")).toHaveText("Orange");
  const hero = page.locator(".pg-frame img");
  await expect(hero).toHaveAttribute("src", new RegExp(`/variants/${green.variantId}/`));
  await expect(hero).not.toHaveAttribute("src", new RegExp(`/variants/${blue.variantId}/`));
  // …and the page says the photo is not of the selected colourway rather than letting it pass as one.
  await expect(page.locator(".pd-photo-note")).toContainText("another colourway");

  // The listing card makes the same choice — it is a separate code path in StoreContext.
  await page.goto(`/shop?q=${encodeURIComponent(product.name)}`);
  await page.waitForLoadState("networkidle");
  const card = page.locator(".product-card").first();
  await expect(card.locator(".product-color")).toHaveText("Orange");
  await expect(card.locator(".product-card-image img"))
    .toHaveAttribute("src", new RegExp(`/variants/${green.variantId}/`));
});

test("when only a sold-out colourway has photos they are shown, but labelled", async ({ page }) => {
  // There is nothing better to show, so an empty frame would be worse. What must not happen is the
  // photo passing as the colourway being sold.
  const product = await createProduct({
    name: `E2E OOS Only ${Date.now()}`,
    variants: [
      { sku: `OOSO-B-${Date.now()}`, variantName: "Blue", color: "Blue", price: money(1500), quantityAvailable: 0 },
      { sku: `OOSO-O-${Date.now()}`, variantName: "Orange", color: "Orange", price: money(1500), quantityAvailable: 5 },
    ],
  });
  const [blue] = product.variants;
  await uploadImage({ productId: product.productId, variantId: blue.variantId, altText: "Blue photo", isPrimary: true });

  await page.goto(`/product/${product.slug}`);
  await expect(page.locator(".pd-variant-label strong")).toHaveText("Orange");
  await expect(page.locator(".pg-frame img")).toHaveAttribute("src", new RegExp(`/variants/${blue.variantId}/`));
  await expect(page.locator(".pd-photo-note")).toContainText("there are none for Orange yet");
  // The colour tile says the same thing, in place.
  await expect(page.getByRole("button", { name: /Orange Another colourway/ })).toBeVisible();
});

test("every stored photo is reachable: a colourway shows its own AND the general shots", async ({ page }) => {
  // ODU's exact shape: one general photo plus one per colourway. Every one of those photos has to
  // be viewable — briefly showing only the colourway's own dropped most of the live catalogue to a
  // single visible picture.
  const product = await createProduct({
    name: `E2E ODU Shape ${Date.now()}`,
    variants: [
      { sku: `ODU-BK-${Date.now()}`, variantName: "Ocean Black", color: "Black", price: money(1500), quantityAvailable: 0 },
      { sku: `ODU-BL-${Date.now()}`, variantName: "Ocean Blue", color: "Blue", price: money(1500), quantityAvailable: 5 },
    ],
  });
  const [black, blue] = product.variants;
  const general = await uploadImage({ productId: product.productId, altText: "product image", isPrimary: true });
  const blackShot = await uploadImage({ productId: product.productId, variantId: black.variantId, altText: "Black" });
  await uploadImage({ productId: product.productId, variantId: blue.variantId, altText: "Blue" });

  await page.goto(`/product/${product.slug}`);
  await expect(page.locator(".pd-variant-label strong")).toHaveText("Blue");

  // Blue's own photo leads, the general shot follows, and both are reachable.
  await expect(page.locator(".pg-frame img")).toHaveAttribute("src", new RegExp(`/variants/${blue.variantId}/`));
  await expect(page.getByRole("button", { name: /^Show photo/ })).toHaveCount(2);
  const sources = await page.locator(".pg-thumbs img").evaluateAll((nodes) => nodes.map((n) => n.getAttribute("src")));
  expect(sources.some((src) => src.includes(general.imageUrl.split("/").pop()))).toBe(true);
  // The other colourway's own photo is still not borrowed into Blue's gallery.
  expect(sources.some((src) => src.includes(blackShot.imageUrl.split("/").pop()))).toBe(false);
});

test("filing a general photo against a colourway removes it from the others", async ({ page }) => {
  // The ODU fix as an admin action rather than a rule change: the Black pair's photograph was
  // uploaded as "general", so it appeared under Blue. Assigning it to Black stops that, and costs
  // Blue nothing else.
  const product = await createProduct({
    name: `E2E Refile ${Date.now()}`,
    variants: [
      { sku: `RF-BK-${Date.now()}`, variantName: "Ocean Black", color: "Black", price: money(1500), quantityAvailable: 0 },
      { sku: `RF-BL-${Date.now()}`, variantName: "Ocean Blue", color: "Blue", price: money(1500), quantityAvailable: 5 },
    ],
  });
  const [black, blue] = product.variants;
  const general = await uploadImage({ productId: product.productId, altText: "photo of the black pair", isPrimary: true });
  await uploadImage({ productId: product.productId, variantId: blue.variantId, altText: "Blue" });
  const generalFile = general.imageUrl.split("/").pop();

  await page.goto(`/product/${product.slug}`);
  const before = await page.locator(".pg-thumbs img").evaluateAll((nodes) => nodes.map((n) => n.getAttribute("src")));
  expect(before.some((src) => src.includes(generalFile))).toBe(true);

  // Refile it onto Ocean Black through the real endpoint the admin control uses.
  const account = await admin();
  await account.client.patch(`/products/${product.productId}/images/${general.imageId}`, { variantId: black.variantId });

  await page.reload();
  await expect(page.locator(".pd-variant-label strong")).toHaveText("Blue");
  const after = await page.locator(".pg-thumbs img, .pg-frame img").evaluateAll((nodes) => nodes.map((n) => n.getAttribute("src")));
  expect(after.some((src) => src.includes(generalFile))).toBe(false);
  // It is still in the catalogue, now owned by Black.
  expect(imageRowsOf(product.productId).join("|")).toContain(`:${black.variantId}:photo of the black pair`);
});

test("selecting several files in the admin uploads all of them, to the chosen colourway", async ({ page }) => {
  // The upload half of the report. The file input is `multiple`; this proves every selected file
  // reaches the catalogue rather than only the first, and that they land on the chosen colour.
  const account = await admin();
  const product = await createProduct({
    name: `E2E Multi Upload ${Date.now()}`,
    variants: [
      { sku: `MU-A-${Date.now()}`, variantName: "Black", color: "Black", price: money(1500), quantityAvailable: 3 },
      { sku: `MU-B-${Date.now()}`, variantName: "Blue", color: "Blue", price: money(1500), quantityAvailable: 4 },
    ],
  });
  const [, blue] = product.variants;
  await uploadImage({ productId: product.productId, altText: "hero", isPrimary: true });

  await submitSignIn(page, account, { admin: true });
  await page.getByRole("button", { name: /^Products$/ }).click();
  await page.getByPlaceholder(/Search product/).fill(product.name);
  await page.getByRole("button", { name: "Manage" }).first().click();
  await expect(page.locator(".admin-image-editor li")).toHaveCount(1);

  // Three files in one go, targeted at Blue.
  await page.locator('.image-form input[type="file"]')
    .setInputFiles([imageFile("one.png"), imageFile("two.png"), imageFile("three.png")]);
  await page.locator('.image-form input[placeholder*="description"]').fill("Blue detail");
  await page.locator(".image-form select").selectOption(String(blue.variantId));
  await page.getByRole("button", { name: /Upload photos/ }).click();

  await expect(page.locator(".admin-image-editor li")).toHaveCount(4, { timeout: 30_000 });
  const blueOwned = imageRowsOf(product.productId).filter((row) => row.split(":")[3] === String(blue.variantId));
  expect(blueOwned).toHaveLength(3);
  // Distinct display orders, so the gallery order is deterministic rather than a three-way tie.
  expect(new Set(blueOwned.map((row) => row.split(":")[1])).size).toBe(3);

  // And the customer can browse all four on Blue: its own three plus the general hero.
  await page.goto(`/product/${product.slug}`);
  await page.getByRole("button", { name: new RegExp(`${product.name} Blue`) }).click();
  await expect(page.getByRole("button", { name: /^Show photo/ })).toHaveCount(4);
});

test("the same photograph cannot be stored twice on one product", async () => {
  // The root cause of "the out-of-stock colour shows in the in-stock one's photos". Admins picked
  // the same file for the product-level field AND the first colourway's field; a general image is
  // shown for every colour by design, so that duplicate put the first (often sold-out) colourway's
  // photo into every other colourway's gallery. Measured on the live catalogue: 4 of 6 products.
  const product = await createProduct({
    name: `E2E Dupe Guard ${Date.now()}`,
    variants: [
      { sku: `DG-A-${Date.now()}`, variantName: "Black", color: "Black", price: money(1500), quantityAvailable: 0 },
      { sku: `DG-B-${Date.now()}`, variantName: "Blue", color: "Blue", price: money(1500), quantityAvailable: 4 },
    ],
  });
  const [black] = product.variants;
  const sameFile = imageFile("shared.png");

  // Once as the colourway's photo…
  await uploadImage({ productId: product.productId, variantId: black.variantId, file: sameFile, altText: "Black" });
  const before = imageRowsOf(product.productId).length;

  // …and again as a general product photo. Refused, whatever it is filed as.
  const failure = await uploadImage({ productId: product.productId, file: sameFile, altText: "product image", isPrimary: true })
    .then(() => null, (error) => error);
  expect(failure, "a byte-identical photo must not be stored twice").toBeTruthy();
  expect(failure.status).toBe(400);
  expect(failure.message).toContain("already on the product");
  expect(imageRowsOf(product.productId).length).toBe(before);

  // A genuinely different photograph is still accepted, so the guard is not just refusing uploads.
  await uploadImage({ productId: product.productId, file: imageFile("different.png"), altText: "case shot", isPrimary: true });
  expect(imageRowsOf(product.productId).length).toBe(before + 1);
});

test("the admin image editor can move a photo between colourways and back to general", async ({ page }) => {
  const account = await admin();
  const product = await createProduct({
    name: `E2E Scope UI ${Date.now()}`,
    variants: [
      { sku: `SC-A-${Date.now()}`, variantName: "Black", color: "Black", price: money(1500), quantityAvailable: 3 },
      { sku: `SC-B-${Date.now()}`, variantName: "Blue", color: "Blue", price: money(1500), quantityAvailable: 4 },
    ],
  });
  const [black] = product.variants;
  const general = await uploadImage({ productId: product.productId, altText: "loose shot", isPrimary: true });

  await submitSignIn(page, account, { admin: true });
  await page.getByRole("button", { name: /^Products$/ }).click();
  await page.getByPlaceholder(/Search product/).fill(product.name);
  await page.getByRole("button", { name: "Manage" }).first().click();

  const scope = page.getByRole("combobox", { name: "Shown for image 1" });
  await expect(scope).toHaveValue("");
  await scope.selectOption(String(black.variantId));
  await expect.poll(() => imageRowsOf(product.productId).join("|")).toContain(`:${black.variantId}:loose shot`);

  // …and back to general, which the API expresses as variantId 0 rather than an absent field.
  await page.getByRole("combobox", { name: "Shown for image 1" }).selectOption("");
  await expect.poll(() => imageRowsOf(product.productId).join("|")).toContain(":-:loose shot");
  expect(general.imageId).toBeTruthy();
});

test("an admin can add several additional photos to one colourway, and only that colourway shows them", async () => {
  // The second half of the request. Uploads go to a named variant and the gallery for that variant
  // lists all of them, in upload order — while the other colourway is unaffected.
  const product = await createProduct({
    name: `E2E Variant Extras ${Date.now()}`,
    variants: [
      { sku: `VX-A-${Date.now()}`, variantName: "Black", color: "Black", price: money(1500), quantityAvailable: 0 },
      { sku: `VX-B-${Date.now()}`, variantName: "Blue", color: "Blue", price: money(1500), quantityAvailable: 4 },
    ],
  });
  const [black, blue] = product.variants;
  await uploadImage({ productId: product.productId, variantId: black.variantId, altText: "Black only", isPrimary: true });
  for (let index = 0; index < 3; index += 1) {
    await uploadImage({ productId: product.productId, variantId: blue.variantId, altText: `Blue ${index + 1}`, displayOrder: index });
  }

  const client = new ApiClient();
  const response = await client.get(`/products/slug/${product.slug}`);
  const blueImages = response.images.filter((image) => image.variantId === blue.variantId);
  expect(blueImages).toHaveLength(3);
  expect(blueImages.map((image) => image.altText)).toEqual(["Blue 1", "Blue 2", "Blue 3"]);
  expect(response.images.filter((image) => image.variantId === black.variantId)).toHaveLength(1);
});

test("all of a colourway's additional photos are browsable on the product page", async ({ page }) => {
  const product = await createProduct({
    name: `E2E Variant Browse ${Date.now()}`,
    variants: [
      { sku: `VB-A-${Date.now()}`, variantName: "Black", color: "Black", price: money(1500), quantityAvailable: 0 },
      { sku: `VB-B-${Date.now()}`, variantName: "Blue", color: "Blue", price: money(1500), quantityAvailable: 4 },
    ],
  });
  const [black, blue] = product.variants;
  await uploadImage({ productId: product.productId, variantId: black.variantId, altText: "Black only", isPrimary: true });
  for (let index = 0; index < 3; index += 1) {
    await uploadImage({ productId: product.productId, variantId: blue.variantId, altText: `Blue ${index + 1}`, displayOrder: index });
  }

  await page.goto(`/product/${product.slug}`);
  await expect(page.locator(".pd-variant-label strong")).toHaveText("Blue");
  // Three thumbnails, all Blue's, and Next walks them.
  await expect(page.getByRole("button", { name: /^Show photo/ })).toHaveCount(3);
  const seen = new Set();
  for (let step = 0; step < 3; step += 1) {
    seen.add(await page.locator(".pg-frame img").getAttribute("src"));
    await page.getByRole("button", { name: "Next photo" }).click();
  }
  expect(seen.size).toBe(3);
  for (const src of seen) expect(src).toContain(`/variants/${blue.variantId}/`);
});

// ── Viewports ─────────────────────────────────────────────────────────────────────────────

for (const [label, viewport] of Object.entries({
  desktop: { width: 1280, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
})) {
  test(`the gallery is reachable at ${label} width and the page does not scroll sideways`, async ({ page }) => {
    // The thumbnail strip used to be `display: none` below 750px, so a phone could reach only the
    // first photo. This is the assertion that would have caught it.
    const product = await productWithGallery(`vp-${label}`);
    await page.setViewportSize(viewport);
    await page.goto(`/product/${product.slug}`);
    await expect(page.locator(".pg-frame img")).toBeVisible();

    const thumbnails = page.getByRole("button", { name: /^Show photo/ });
    await expect(thumbnails.first()).toBeVisible();

    // Every thumbnail must be clickable, not merely present.
    await thumbnails.last().click();
    await expect(page.locator(".pg-frame img")).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth, `${label} overflows horizontally`).toBeLessThanOrEqual(overflow.clientWidth);
  });
}

// ── Admin flow in the browser ─────────────────────────────────────────────────────────────

test("renaming a product does not move its public URL", async ({ page }) => {
  const product = await productWithGallery("rename");
  const account = await admin();
  const categoryId = Number(sqlValue("SELECT CATEGORY_ID FROM CATEGORIES WHERE CATEGORY_NAME='Men' LIMIT 1"));

  await account.client.put(`/products/${product.productId}`, {
    productName: `${product.name} RENAMED`,
    productDescription: "renamed copy",
    brand: "Shades World",
    basePrice: money(1500),
    categoryIds: [categoryId],
  });

  const slugNow = sqlValue(`SELECT SLUG FROM PRODUCTS WHERE PRODUCT_ID=${product.productId}`);
  expect(slugNow, "a rename must not break shared links").toBe(product.slug);

  // And the old link still resolves in a browser, now showing the new name.
  await page.goto(`/product/${product.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: `${product.name} RENAMED` })).toBeVisible();
});

test("an admin-supplied slug is validated and a duplicate is refused", async () => {
  const product = await productWithGallery("custom-slug");
  const account = await admin();
  const categoryId = Number(sqlValue("SELECT CATEGORY_ID FROM CATEGORIES WHERE CATEGORY_NAME='Men' LIMIT 1"));
  const base = {
    productName: product.name,
    productDescription: "copy",
    brand: "Shades World",
    basePrice: money(1500),
    categoryIds: [categoryId],
  };

  for (const [slug, expectedStatus, why] of [
    ["Has Spaces", 400, "malformed"],
    ["admin", 400, "reserved"],
    ["12345", 400, "all digits, ambiguous with a legacy id"],
  ]) {
    const failure = await account.client.put(`/products/${product.productId}`, { ...base, slug })
      .then(() => null, (error) => error);
    expect(failure, `${why} should be refused`).toBeTruthy();
    expect(failure.status, `${slug} (${why})`).toBe(expectedStatus);
  }

  // A duplicate of another product's slug is a conflict, not a silent overwrite.
  const other = await productWithGallery("custom-slug-other");
  const conflict = await account.client.put(`/products/${product.productId}`, { ...base, slug: other.slug })
    .then(() => null, (error) => error);
  expect(conflict).toBeTruthy();
  expect(conflict.status).toBe(409);

  // A valid one is accepted and becomes the product's address.
  const accepted = `e2e-custom-${Date.now()}`;
  await account.client.put(`/products/${product.productId}`, { ...base, slug: accepted });
  expect(sqlValue(`SELECT SLUG FROM PRODUCTS WHERE PRODUCT_ID=${product.productId}`)).toBe(accepted);
});

test("an admin uploads, reorders, re-primaries and captions images, and it all survives a refresh", async ({ page }) => {
  const account = await admin();
  const product = await productWithGallery("admin-ui");
  const seen = observe(page);

  // The shared helper, not a hand-rolled form fill: /sign in/i as an accessible-name matcher also
  // matches the Google "Sign in with Google" button, and submitSignIn additionally waits out the
  // login rate limit that a long run legitimately trips.
  await submitSignIn(page, account, { admin: true });

  await page.getByRole("button", { name: /^Products$/ }).click();
  await page.getByPlaceholder(/Search product/).fill(product.name);
  await page.getByRole("button", { name: "Manage" }).first().click();

  const rows = page.locator(".admin-image-editor li");
  const startingImages = imageRowsOf(product.productId).length;
  await expect(rows).toHaveCount(startingImages);

  // Upload one more photo through the real file input.
  await page.locator('.image-form input[type="file"]').setInputFiles(imageFile("uploaded.png"));
  await page.locator('.image-form input[placeholder*="description"]').fill("Uploaded via admin UI");
  await page.getByRole("button", { name: /Upload photos/ }).click();
  await expect(rows).toHaveCount(startingImages + 1, { timeout: 30_000 });

  // Reorder: move the last image up one place.
  const idsBefore = imageRowsOf(product.productId).map((row) => Number(row.split(":")[0]));
  await rows.last().getByRole("button", { name: new RegExp(`Move image ${startingImages + 1} earlier`) }).click();
  await expect.poll(() => imageRowsOf(product.productId).map((row) => Number(row.split(":")[0])))
    .not.toEqual(idsBefore);

  // Promote a NAMED image — the one just uploaded — rather than "whatever is at index 1", so the
  // rest of this test can wait on content instead of position.
  const uploadedRow = rows.filter({ has: page.locator('input[value="Uploaded via admin UI"]') });
  await uploadedRow.getByRole("button", { name: "Make primary" }).click();

  // Wait for the PRIMARY ROW TO BE THAT IMAGE, not merely for a primary row to exist.
  //
  // The previous version waited on `expect(primaryRow).toHaveCount(1)`, which is vacuous: exactly
  // one row carries .is-primary at every instant, including while the list is still showing the
  // OLD primary. It passed immediately and the caption went to the wrong photo — a wait that
  // measured nothing, and green until the catalogue grew large enough to slow the re-render down.
  const primaryRow = page.locator(".admin-image-editor li.is-primary");
  await expect(primaryRow.getByRole("textbox")).toHaveValue("Uploaded via admin UI");
  const caption = primaryRow.getByRole("textbox");
  await caption.fill("Primary caption from admin");
  // Tab, not locator.blur(). The alt text saves on blur, and blur() left the field focused here, so
  // the handler never fired and nothing was written — a test that would have reported a working
  // feature as broken.
  await caption.press("Tab");
  await expect.poll(() => imageRowsOf(product.productId).join("|"), { timeout: 15_000 })
    .toContain("Primary caption from admin");
  // …and it landed on the PRIMARY image, which is row 1.
  expect(imageRowsOf(product.productId)[0]).toContain("Primary caption from admin");

  // Everything above must survive a reload — this is the step that catches state that only ever
  // lived in React.
  const persisted = imageRowsOf(product.productId);
  await page.reload();
  await page.getByRole("button", { name: /^Products$/ }).click();
  await page.getByPlaceholder(/Search product/).fill(product.name);
  await page.getByRole("button", { name: "Manage" }).first().click();
  await expect(page.locator(".admin-image-editor li")).toHaveCount(startingImages + 1);
  expect(imageRowsOf(product.productId)).toEqual(persisted);
  expect(persisted.filter((row) => row.split(":")[2] === "1")).toHaveLength(1);

  // Remove one image; the gallery stays coherent and keeps exactly one primary.
  await page.locator(".admin-image-editor li").last().getByRole("button", { name: /Remove image/ }).click();
  await expect(page.locator(".admin-image-editor li")).toHaveCount(startingImages, { timeout: 30_000 });
  expect(imageRowsOf(product.productId).filter((row) => row.split(":")[2] === "1")).toHaveLength(1);

  expect(clean(seen), "the page must be clean").toEqual(CLEAN);
});
