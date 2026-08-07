// Product fixtures created through the real admin API, so the same validation, image handling and
// inventory-movement bookkeeping a real admin triggers is exercised here too.
const { createCustomer, promoteToAdmin, sql, sqlValue } = require("./api");

let adminPromise = null;

/**
 * One admin for the whole run. Registration is rate-limited per IP, so this is cached.
 *
 * A *rejected* promise is deliberately not kept. Creating this account is the most rate-limit-prone
 * thing the harness does — it spends a register, a verify-email and two logins — so it fails
 * transiently, and a cached rejection would then fail every remaining test in the run with the
 * first failure's message, burying whatever they were each meant to prove. Clearing the slot lets
 * the next caller make a real attempt.
 */
const admin = () => {
  if (!adminPromise) {
    const attempt = (async () => {
      const account = await createCustomer("admin");
      promoteToAdmin(account.userId);
      // The session must be re-established for the new role to appear in the principal. This is
      // the second login for this account inside one minute, so it goes through the backoff: a
      // bare post() here is exactly the call that used to poison the cache.
      await account.client.requestWithRateLimitBackoff(
        "POST", "/auth/login", { email: account.email, password: account.password }
      );
      return account;
    })();
    // Attached before the slot is published so the rejection is always handled here — otherwise a
    // failure at a moment when nothing is awaiting surfaces as an unhandled rejection instead.
    // The identity check keeps a late rejection from clearing a newer, healthy attempt.
    attempt.catch(() => { if (adminPromise === attempt) adminPromise = null; });
    adminPromise = attempt;
  }
  return adminPromise;
};

/**
 * Creates a product with two variants at known stock levels.
 * Returns the storefront shape the tests need, including per-variant ids and SKUs.
 */
const createProduct = async ({ name, categoryName = "Men", variants }) => {
  const account = await admin();
  const categoryId = Number(sqlValue(`SELECT CATEGORY_ID FROM CATEGORIES WHERE CATEGORY_NAME='${categoryName}' LIMIT 1`));
  const asVariantRequest = (variant) => ({
    sku: variant.sku,
    variantName: variant.variantName,
    variantDescription: variant.variantDescription ?? null,
    price: variant.price,
    quantityAvailable: variant.quantityAvailable,
    lowStockThreshold: variant.lowStockThreshold ?? 1,
    attributes: { color: variant.color },
  });

  // The create endpoint takes exactly one initialVariant; any others go through the add-variant
  // endpoint, which is also how the admin UI builds a multi-colour product.
  const [first, ...rest] = variants;
  const created = await account.client.post("/products", {
    productName: name,
    productDescription: `${name} shared product copy`,
    brand: "Shades World",
    basePrice: first.price,
    categoryIds: [categoryId],
    attributes: { frame_material: "Steel", uv_protection: "UV400" },
    initialVariant: asVariantRequest(first),
  });
  for (const variant of rest) {
    await account.client.post(`/products/${created.productId}/variants`, asVariantRequest(variant));
  }

  const full = await account.client.get(`/products/${created.productId}`);
  return {
    productId: full.productId,
    name: full.productName,
    variants: full.variants.map((variant) => ({
      variantId: variant.variantId, sku: variant.sku, variantName: variant.variantName,
      price: Number(variant.price), quantityAvailable: variant.quantityAvailable,
    })),
  };
};

/** Stock straight from the database — the authority the UI is being checked against. */
const stockOf = (variantId) => Number(sqlValue(`SELECT QUANTITY_AVAILABLE FROM PRODUCT_VARIANTS WHERE VARIANT_ID=${Number(variantId)}`));

/** SALE / CANCELLATION rows for an order, proving a decrement happened exactly once. */
const movementsForOrder = (orderId) =>
  sql(`SELECT CONCAT(MOVEMENT_TYPE,':',VARIANT_ID,':',QUANTITY_CHANGE) FROM INVENTORY_MOVEMENTS
       WHERE REFERENCE_ID=${Number(orderId)} ORDER BY INVENTORY_MOVEMENT_ID`)
    // MySQL pads the CONCAT result for the fixed-width quantity column, so trim each row.
    .split("\n").map((row) => row.trim()).filter(Boolean);

const orderStatus = (orderId) => sqlValue(`SELECT ORDER_STATUS FROM ORDERS WHERE ORDER_ID=${Number(orderId)}`);

/** Marks an order DELIVERED through the real admin endpoint — the only route to a reviewable item. */
const markDelivered = async (orderId) => {
  const account = await admin();
  for (const status of ["PROCESSING", "SHIPPED", "DELIVERED"]) {
    try { await account.client.patch(`/orders/admin/${orderId}/status`, { status, notes: "E2E fixture transition" }); }
    catch (error) { if (!/transition|status/i.test(error.message)) throw error; }
  }
  return orderStatus(orderId);
};

module.exports = { admin, createProduct, markDelivered, movementsForOrder, orderStatus, stockOf };
