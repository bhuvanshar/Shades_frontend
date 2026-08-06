const { test, expect } = require("@playwright/test");
const { createProduct } = require("./support/fixtures");

// A pagination control once pushed the home page into horizontal scroll at 375px, and it was
// caught only because one unrelated test happened to assert scrollWidth <= innerWidth. This spec
// makes that check systematic: every public route, at the narrowest widths we support.
//
// Horizontal scroll on a phone is a real defect — content sits off-screen with no affordance to
// reach it — and it appears when data grows (more pages, longer names), which is exactly when
// nobody is looking.

const WIDTHS = [
  { name: "small phone", width: 320, height: 720 },
  { name: "phone", width: 375, height: 812 },
  { name: "large phone", width: 414, height: 896 },
  { name: "tablet", width: 768, height: 1024 },
];

/** The elements actually sticking out, so a failure names the culprit instead of just the page. */
const overflowReport = (page) => page.evaluate(() => {
  const limit = document.documentElement.clientWidth;
  const offenders = [];
  for (const node of document.querySelectorAll("body *")) {
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const style = getComputedStyle(node);
    if (style.position === "fixed" || style.visibility === "hidden" || style.display === "none") continue;
    if (rect.right > limit + 1 || rect.left < -1) {
      offenders.push({
        tag: node.tagName.toLowerCase(),
        className: String(node.className || "").slice(0, 60),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
      });
    }
  }
  return {
    limit,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    // Innermost offenders are the useful ones; a parent overflows because a child does.
    offenders: offenders.slice(-6),
  };
});

let product;

test.beforeAll(async () => {
  // A long product name and SKU: unbroken strings are a classic source of overflow, and the
  // catalogue is large enough by now that the paginated grid renders its full control row.
  product = await createProduct({
    name: `E2E Overflow Extraordinarily Long Product Name For Wrapping ${Date.now()}`,
    variants: [{
      sku: `OVERFLOW-VERY-LONG-SKU-${Date.now()}`,
      variantName: "Exceptionally Long Colourway Name",
      color: "Exceptionally Long Colourway Name",
      price: 1200, quantityAvailable: 4,
    }],
  });
});

const routes = () => [
  { name: "home", path: "/" },
  { name: "shop", path: "/shop" },
  { name: "shop paginated", path: "/shop?page=2" },
  { name: "collections", path: "/collections" },
  { name: "collection detail", path: "/collections/men" },
  { name: "product detail", path: `/product/${product.productId}` },
  { name: "cart", path: "/cart" },
  { name: "store info", path: "/info/contact" },
  { name: "sign in", path: "/signin" },
];

for (const size of WIDTHS) {
  test(`no route scrolls horizontally at ${size.width}px (${size.name})`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    const failures = [];

    for (const route of routes()) {
      await page.goto(route.path);
      // Let the catalogue land so data-driven widths (pagination, tiles) are actually rendered.
      await page.waitForLoadState("networkidle");
      const report = await overflowReport(page);
      if (report.scrollWidth > report.limit + 1 || report.offenders.length > 0) {
        failures.push(`${route.name} (${route.path}): scrollWidth ${report.scrollWidth} > ${report.limit}; `
          + `offenders ${JSON.stringify(report.offenders)}`);
      }
    }

    expect(failures, `horizontal overflow at ${size.width}px`).toEqual([]);
  });
}

test("the paginated grid keeps its controls inside a narrow viewport", async ({ page }) => {
  // The specific regression: with several pages the Previous/1..n/Next row grew wider than a
  // phone. It must wrap rather than push the document sideways.
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/shop");
  await page.waitForLoadState("networkidle");

  const pagination = page.locator(".product-pagination");
  if (await pagination.count() === 0) {
    test.skip(true, "catalogue is a single page, so no pagination control is rendered");
  }
  const box = await pagination.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320 + 1);
  const report = await overflowReport(page);
  expect(report.offenders).toEqual([]);
});
