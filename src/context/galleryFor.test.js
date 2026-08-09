import { galleryFor, imageForVariant, isBorrowedImage, mapProduct } from "./StoreContext";

/**
 * Which photos a colourway shows.
 *
 * Regression cover for a reported bug: a product page that said "Add Orange to bag" while showing
 * two photographs of a sold-out Blue, because every fallback ended at "the primary image, else the
 * first image" without asking whether that photo's variant could be bought.
 */

const image = (id, variantId, alt) => ({ imageId: id, publicId: `p${id}`, imageUrl: `/img/${id}.jpg`, altText: alt, variantId, isPrimary: id === 1 });
const variant = (id, quantityAvailable, isActive = true) => ({ variantId: id, sku: `SKU${id}`, price: 100, quantityAvailable, isActive });

const BLUE = variant(10, 0);        // sold out
const ORANGE = variant(11, 5);      // in stock, the one that gets selected
const GREEN = variant(12, 7);       // in stock

describe("galleryFor", () => {
  test("a variant shows its own photos AND the general product photos", () => {
    // A general photo is product-wide by definition — a case, a lens detail, a packaging shot — so
    // it belongs in every colourway's gallery. Briefly returning only the variant's own photos hid
    // these entirely: measured on the live catalogue, five of six products fell to a single visible
    // picture because each was authored as "one photo per colour plus one general".
    const product = { variants: [BLUE, ORANGE], images: [image(1, null, "general"), image(2, 11, "orange")] };
    expect(galleryFor(product, ORANGE).map((i) => i.altText)).toEqual(["orange", "general"]);
  });

  test("several photos on one colourway are all shown, own first, then the general ones", () => {
    const product = {
      variants: [BLUE, ORANGE],
      images: [image(1, null, "general"), image(2, 11, "orange-a"), image(3, 11, "orange-b"), image(4, 11, "orange-c")],
    };
    expect(galleryFor(product, ORANGE).map((i) => i.altText))
      .toEqual(["orange-a", "orange-b", "orange-c", "general"]);
  });

  test("filing a photo against a colourway removes it from the other colourways", () => {
    // This is the ODU fix, expressed as data rather than as a rule. The Black pair's photograph was
    // uploaded as "general", so it showed under Blue. Assigning it to Black — what the admin
    // image editor's "Shown for" control does — is what stops that, and it costs Blue nothing.
    const asGeneral = { variants: [BLUE, ORANGE], images: [image(1, null, "black pair"), image(2, 11, "orange")] };
    expect(galleryFor(asGeneral, ORANGE).map((i) => i.altText)).toContain("black pair");

    const filed = { variants: [BLUE, ORANGE], images: [image(1, 10, "black pair"), image(2, 11, "orange")] };
    expect(galleryFor(filed, ORANGE).map((i) => i.altText)).toEqual(["orange"]);
    expect(galleryFor(filed, BLUE).map((i) => i.altText)).toEqual(["black pair"]);
  });

  test("a variant with no photos of its own falls back to the general shots", () => {
    const product = { variants: [BLUE, ORANGE], images: [image(1, null, "general"), image(2, 10, "blue")] };
    expect(galleryFor(product, ORANGE).map((i) => i.altText)).toEqual(["general"]);
  });

  // ── The reported bug ────────────────────────────────────────────────────────────────────

  test("borrows from an IN-STOCK colourway rather than a sold-out one", () => {
    // Blue is sold out and owns the PRIMARY photo; Green is in stock. Orange has none of its own.
    const product = { variants: [BLUE, ORANGE, GREEN], images: [image(1, 10, "blue"), image(3, 12, "green")] };
    expect(galleryFor(product, ORANGE).map((i) => i.altText)).toEqual(["green"]);
  });

  test("never leads with a sold-out variant's photo even when it is the primary one", () => {
    const product = { variants: [BLUE, ORANGE, GREEN], images: [image(1, 10, "blue"), image(3, 12, "green")] };
    expect(galleryFor(product, ORANGE)[0].altText).not.toBe("blue");
    expect(imageForVariant(product, ORANGE).altText).toBe("green");
  });

  test("the rule this replaced would fail the test above", () => {
    // Guards against the regression cover being vacuous. This is the old fallback, verbatim:
    //   variant's own -> isPrimary -> first non-variant -> images[0]
    // On the same fixture it picks the sold-out Blue, which is the reported bug. If a future change
    // made galleryFor equivalent to this again, the test above would start failing — and if this
    // assertion ever passes trivially, the fixture has stopped exercising the case.
    const product = { variants: [BLUE, ORANGE, GREEN], images: [image(1, 10, "blue"), image(3, 12, "green")] };
    const oldRule = (images, forVariant) => images.find((i) => String(i.variantId) === String(forVariant.variantId))
      || images.find((i) => i.isPrimary)
      || images.find((i) => !i.variantId)
      || images[0];
    expect(oldRule(product.images, ORANGE).altText).toBe("blue");
    expect(galleryFor(product, ORANGE)[0].altText).toBe("green");
  });

  test("an inactive variant's photos are not borrowed either", () => {
    const inactive = variant(13, 9, false);
    const product = { variants: [ORANGE, inactive], images: [image(4, 13, "inactive")] };
    // Nothing purchasable has a photo, so the last resort applies rather than silently showing
    // nothing — but it is reached only because there is no better option.
    expect(galleryFor(product, ORANGE).map((i) => i.altText)).toEqual(["inactive"]);
  });

  test("when only a sold-out variant has photography, it is shown as a last resort", () => {
    // The honest outcome: a product with photos should not render an empty frame. The page labels
    // it — see isBorrowedImage — rather than pretending the picture is the selected colourway.
    const product = { variants: [BLUE, ORANGE], images: [image(1, 10, "blue")] };
    expect(galleryFor(product, ORANGE).map((i) => i.altText)).toEqual(["blue"]);
    expect(isBorrowedImage(product, ORANGE, galleryFor(product, ORANGE)[0])).toBe(true);
  });

  test("a fully sold-out product still shows its photographs", () => {
    const product = { variants: [BLUE, variant(14, 0)], images: [image(1, 10, "blue")] };
    expect(galleryFor(product, BLUE).map((i) => i.altText)).toEqual(["blue"]);
  });

  test("a product with no images at all yields an empty gallery, not a crash", () => {
    expect(galleryFor({ variants: [ORANGE], images: [] }, ORANGE)).toEqual([]);
    expect(galleryFor(undefined, undefined)).toEqual([]);
    expect(imageForVariant({ variants: [], images: [] }, null)).toBeUndefined();
  });

  test("borrowed order follows the shared variant order, so it is deterministic", () => {
    const product = { variants: [BLUE, ORANGE, GREEN], images: [image(5, 12, "green"), image(6, 10, "blue")] };
    // Called repeatedly to catch an ordering that depends on image arrival order.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(galleryFor(product, ORANGE).map((i) => i.altText)).toEqual(["green"]);
    }
  });
});

describe("isBorrowedImage", () => {
  test("is true only for another colourway's photo", () => {
    expect(isBorrowedImage({}, ORANGE, image(1, 10, "blue"))).toBe(true);
    expect(isBorrowedImage({}, ORANGE, image(2, 11, "orange"))).toBe(false);
    // A general product shot is not "another colourway" — it belongs to no variant.
    expect(isBorrowedImage({}, ORANGE, image(3, null, "general"))).toBe(false);
    expect(isBorrowedImage({}, ORANGE, undefined)).toBe(false);
  });
});

describe("the listing card picks the same photo", () => {
  test("a card selling Orange does not carry a sold-out Blue's photograph", () => {
    const mapped = mapProduct({
      productId: 1, slug: "s", productName: "Frame", basePrice: 100, isNew: false,
      variants: [
        { ...BLUE, variantName: "Blue" },
        { ...ORANGE, variantName: "Orange" },
        { ...GREEN, variantName: "Green" },
      ],
      images: [image(1, 10, "blue"), image(3, 12, "green")],
      categories: [], attributes: {},
    });
    // Orange is the default (first purchasable) and has no photo of its own.
    expect(mapped.color).toBe("Orange");
    expect(mapped.image).toBe("/img/3.jpg");
    expect(mapped.image).not.toBe("/img/1.jpg");
  });
});
