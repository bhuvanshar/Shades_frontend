const { test, expect } = require("@playwright/test");
const { createProduct, movementsForOrder, orderStatus, stockOf } = require("./support/fixtures");
const { sqlValue } = require("./support/api");
const { fillCheckoutAddress, signInAsNewCustomer } = require("./support/ui");

// Checkout: pincode validation on both sides, real inventory decrements asserted against MySQL,
// no overselling, no double decrement, and the cancellation modal.

const freshProduct = (label, variants) => createProduct({
  name: `E2E ${label} ${Date.now()}`,
  variants: variants.map((variant, index) => ({
    sku: `${label.toUpperCase()}-${index}-${Date.now()}`, ...variant,
  })),
});

const addToBag = async (page, productId, colour, times = 1) => {
  await page.goto(`/product/${productId}`);
  if (colour) await page.locator(".pd-variant-options button", { hasText: colour }).click();
  for (let i = 0; i < times; i += 1) await page.locator(".pd-add-btn").click();
};

const placeOrder = async (page, { pincode = "560001", country = "India" } = {}) => {
  await page.goto("/order");
  await fillCheckoutAddress(page, { pincode, country });
  await page.locator(".checkout-confirm input[type=checkbox]").check();
  await page.locator(".checkout-pay-btn").click();
};

test("pincode accepts digits only, sanitises pasted junk and keeps a leading zero", async ({ page }) => {
  const product = await freshProduct("pin", [{ variantName: "Rose", color: "Rose", price: 900, quantityAvailable: 5 }]);
  await signInAsNewCustomer(page, "pin");
  await addToBag(page, product.productId);
  await page.goto("/order");
  await fillCheckoutAddress(page, {});

  const field = page.getByLabel("PIN code");

  // Typed letters and symbols never enter the field at all.
  await field.fill("");
  await field.type("5a6b0c0d0e1");
  await expect(field).toHaveValue("560001");

  // A genuinely pasted value is sanitised the same way. This is a real clipboard paste rather
  // than fill(), which truncates at the newline and would not exercise the paste path at all.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("  12a3 45\n6  "));
  await field.fill("");
  await field.focus();
  await page.keyboard.press("Control+V");
  await expect(field).toHaveValue("123456");

  // India: 6 digits, and a leading zero is rejected by the rule but never silently rewritten.
  await field.fill("060001");
  await expect(page.locator(".checkout-field-error")).toContainText("6-digit");

  // A non-India destination keeps its leading zero — the value is a string, never a number.
  await page.getByPlaceholder("Country").fill("Spain");
  await field.fill("08001");
  await expect(field).toHaveValue("08001");
  await expect(page.locator(".checkout-field-error")).toHaveCount(0);
});

test("the server rejects a bad pincode even if the client is bypassed", async ({ page }) => {
  const account = await signInAsNewCustomer(page, "pinapi");
  // Straight at the API, skipping the form entirely.
  const bad = account.client.post("/addresses", {
    addressType: "SHIPPING", recipientName: "E2E", phoneNumber: "9876543210",
    addressLine1: "1 Test Street", city: "Bengaluru", state: "KA",
    pincode: "60001", country: "India", isDefault: true,
  });
  await expect(bad).rejects.toThrow(/6-digit Indian PIN code/);

  const letters = account.client.post("/addresses", {
    addressType: "SHIPPING", recipientName: "E2E", phoneNumber: "9876543210",
    addressLine1: "1 Test Street", city: "Bengaluru", state: "KA",
    pincode: "5600A1", country: "India", isDefault: true,
  });
  await expect(letters).rejects.toThrow(/digits only|validation/i);

  // And a legitimate foreign code with a leading zero is stored verbatim.
  const saved = await account.client.post("/addresses", {
    addressType: "SHIPPING", recipientName: "E2E", phoneNumber: "9876543210",
    addressLine1: "Carrer de Test 1", city: "Barcelona", state: "Catalonia",
    pincode: "08001", country: "Spain", isDefault: true,
  });
  expect(saved.pincode).toBe("08001");
  expect(sqlValue(`SELECT PINCODE FROM ADDRESSES WHERE ADDRESS_ID=${saved.addressId}`)).toBe("08001");
});

test("an order with two variants decrements exactly those variants in the database and the UI", async ({ page }) => {
  const product = await freshProduct("inv", [
    { variantName: "Ocean", color: "Blue", price: 1000, quantityAvailable: 5 },
    { variantName: "Night", color: "Black", price: 1000, quantityAvailable: 4 },
  ]);
  const [blue, black] = product.variants;
  expect(stockOf(blue.variantId)).toBe(5);
  expect(stockOf(black.variantId)).toBe(4);

  await signInAsNewCustomer(page, "inv");
  await addToBag(page, product.productId, "Blue", 2);
  await addToBag(page, product.productId, "Black", 1);
  await expect(page.locator(".cart-badge")).toHaveText("3");

  await placeOrder(page);
  await expect(page).toHaveURL(/my-orders/, { timeout: 30_000 });

  // The database is the authority: exactly the purchased quantities came off.
  expect(stockOf(blue.variantId)).toBe(3);
  expect(stockOf(black.variantId)).toBe(3);

  const orderId = Number(sqlValue(`SELECT MAX(ORDER_ID) FROM ORDERS`));
  const movements = movementsForOrder(orderId);
  expect(movements).toEqual(expect.arrayContaining([
    `SALE:${blue.variantId}:-2`, `SALE:${black.variantId}:-1`,
  ]));
  // One SALE row per line, so nothing was decremented twice.
  expect(movements.filter((row) => row.startsWith("SALE:"))).toHaveLength(2);

  // And the storefront reflects the new stock without a manual reload.
  await page.goto(`/product/${product.productId}`);
  await page.locator(".pd-variant-options button", { hasText: "Blue" }).click();
  await expect(page.locator(".pd-stock")).toContainText("3 in stock");
});

test("the server refuses to oversell and the bag shows real stock afterwards", async ({ page }) => {
  const product = await freshProduct("oversell", [
    { variantName: "Solo", color: "Amber", price: 800, quantityAvailable: 1 },
  ]);
  const [only] = product.variants;

  const account = await signInAsNewCustomer(page, "oversell");
  await addToBag(page, product.productId, "Amber", 1);

  // The UI caps at stock, so the oversell attempt goes straight at the API the way a crafted
  // request or a stale tab would. The server is the authority and must refuse.
  await expect(account.client.post("/cart/items", { variantId: only.variantId, quantity: 5 }))
    .rejects.toThrow(/available|stock|inventory/i);
  expect(stockOf(only.variantId)).toBe(1);

  await placeOrder(page);
  await expect(page).toHaveURL(/my-orders/, { timeout: 30_000 });
  expect(stockOf(only.variantId)).toBe(0);

  // A second shopper cannot buy the unit that is gone.
  await page.context().clearCookies();
  await signInAsNewCustomer(page, "oversell2");
  await page.goto(`/product/${product.productId}`);
  await expect(page.locator(".pd-add-btn")).toBeDisabled();
  await expect(page.locator(".pd-add-btn")).toContainText("Out of stock");
});

test("a repeated payment call cannot decrement stock twice", async ({ page }) => {
  const product = await freshProduct("idem", [
    { variantName: "Twice", color: "Teal", price: 700, quantityAvailable: 4 },
  ]);
  const [variant] = product.variants;
  const account = await signInAsNewCustomer(page, "idem");
  await addToBag(page, product.productId, "Teal", 2);
  await placeOrder(page);
  await expect(page).toHaveURL(/my-orders/, { timeout: 30_000 });

  const orderId = Number(sqlValue(`SELECT MAX(ORDER_ID) FROM ORDERS`));
  expect(stockOf(variant.variantId)).toBe(2);

  // Replay the payment callback. It must be idempotent: the existing PAID payment is returned
  // and no second SALE movement is written.
  await account.client.post(`/payments/orders/${orderId}`, { paymentMethod: "CARD" }).catch(() => {});
  await account.client.post(`/payments/orders/${orderId}`, { paymentMethod: "CARD" }).catch(() => {});

  expect(stockOf(variant.variantId)).toBe(2);
  expect(movementsForOrder(orderId).filter((row) => row.startsWith("SALE:"))).toHaveLength(1);
});

test("cancelling asks first, cancels once, and restores stock", async ({ page }) => {
  const product = await freshProduct("cancel", [
    { variantName: "Return", color: "Ivory", price: 600, quantityAvailable: 3 },
  ]);
  const [variant] = product.variants;
  await signInAsNewCustomer(page, "cancel");
  await addToBag(page, product.productId, "Ivory", 1);
  await placeOrder(page);
  await expect(page).toHaveURL(/my-orders/, { timeout: 30_000 });
  const orderId = Number(sqlValue(`SELECT MAX(ORDER_ID) FROM ORDERS`));
  expect(stockOf(variant.variantId)).toBe(2);

  // Nothing happens before confirmation.
  await page.locator(".cancel-order-button").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("cannot be undone");
  expect(orderStatus(orderId)).not.toBe("CANCELLED");

  // Closing preserves the order.
  await page.getByRole("button", { name: "Keep order" }).click();
  await expect(dialog).toHaveCount(0);
  expect(orderStatus(orderId)).not.toBe("CANCELLED");
  expect(stockOf(variant.variantId)).toBe(2);

  // Escape also preserves it.
  await page.locator(".cancel-order-button").first().click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(orderStatus(orderId)).not.toBe("CANCELLED");

  // Confirming cancels exactly once and returns the stock.
  await page.locator(".cancel-order-button").first().click();
  await page.getByRole("button", { name: "Cancel the order" }).click();
  await expect(page.locator(".orders-notice")).toContainText(`Order #${orderId} was cancelled`, { timeout: 30_000 });
  expect(orderStatus(orderId)).toBe("CANCELLED");
  expect(stockOf(variant.variantId)).toBe(3);
  // Exactly one restore, not two.
  expect(movementsForOrder(orderId).filter((row) => row.startsWith("CANCELLATION:"))).toHaveLength(1);
});
