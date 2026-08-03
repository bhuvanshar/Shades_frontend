const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";

const parseResponse = async (response) => {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || "Something went wrong. Please try again.");
  }
  return payload;
};

export const login = async (email, password) => {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return parseResponse(response);
};

export const register = async ({ name, email, password, phoneNumber }) => {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password, phoneNumber: phoneNumber || null }),
  });
  return parseResponse(response);
};

export const forgotPassword = async (email) => {
  const response = await fetch(`${API_URL}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return parseResponse(response);
};

export const resetPassword = async (token, newPassword) => {
  const response = await fetch(`${API_URL}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, newPassword }),
  });
  return parseResponse(response);
};

export const googleLogin = async (credential) => {
  const response = await fetch(`${API_URL}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  return parseResponse(response);
};

export const refreshAccessToken = async (refreshToken) => {
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  return parseResponse(response);
};

export const getCurrentUser = async (accessToken) => {
  const response = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseResponse(response);
};

export const getStoreProducts = async () => {
  const response = await fetch(`${API_URL}/products?size=200&sort=productId,desc`);
  return parseResponse(response);
};

export const logout = async (accessToken) => {
  const response = await fetch(`${API_URL}/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return parseResponse(response);
};

const authenticatedRequest = async (path, accessToken, options = {}) => {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
  });
  return parseResponse(response);
};

export const getCoupons = (accessToken) =>
  authenticatedRequest("/coupons?size=100&sort=couponId,desc", accessToken);

export const createCoupon = (accessToken, coupon) =>
  authenticatedRequest("/coupons", accessToken, {
    method: "POST",
    body: JSON.stringify(coupon),
  });

export const validateCoupon = (accessToken, couponCode, orderAmount, itemQuantity) =>
  authenticatedRequest("/coupons/validate", accessToken, {
    method: "POST",
    body: JSON.stringify({ couponCode, orderAmount, itemQuantity }),
  });

export const deactivateCoupon = async (accessToken, couponId) => {
  const response = await fetch(`${API_URL}/coupons/${couponId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return parseResponse(response);
};

export const getAdminProducts = (accessToken) =>
  authenticatedRequest("/products/admin/all?size=200&sort=productId,desc", accessToken);

export const getCategories = async () => {
  const response = await fetch(`${API_URL}/categories`);
  return parseResponse(response);
};

export const createProduct = (accessToken, product) =>
  authenticatedRequest("/products", accessToken, { method: "POST", body: JSON.stringify(product) });

export const updateProduct = (accessToken, productId, product) =>
  authenticatedRequest(`/products/${productId}`, accessToken, { method: "PUT", body: JSON.stringify(product) });

export const setProductActive = (accessToken, productId, active) =>
  authenticatedRequest(`/products/${productId}/active?active=${active}`, accessToken, { method: "PATCH" });

export const removeProduct = (accessToken, productId) =>
  authenticatedRequest(`/products/${productId}`, accessToken, { method: "DELETE" });

export const addProductVariant = (accessToken, productId, variant) =>
  authenticatedRequest(`/products/${productId}/variants`, accessToken, { method: "POST", body: JSON.stringify(variant) });

export const deleteProductVariant = (accessToken, productId, variantId) =>
  authenticatedRequest(`/products/${productId}/variants/${variantId}`, accessToken, { method: "DELETE" });

export const addProductImage = (accessToken, productId, image) =>
  authenticatedRequest(`/products/${productId}/images`, accessToken, { method: "POST", body: JSON.stringify(image) });

export const uploadProductImage = (accessToken, productId, file, metadata = {}) => {
  const form = new FormData();
  form.append("file", file);
  form.append("altText", metadata.altText || "");
  form.append("displayOrder", String(metadata.displayOrder || 0));
  form.append("isPrimary", String(Boolean(metadata.isPrimary)));
  if (metadata.variantId) form.append("variantId", String(metadata.variantId));
  return authenticatedRequest(`/products/${productId}/images/upload`, accessToken, { method: "POST", body: form });
};

export const deleteProductImage = (accessToken, productId, imageId) =>
  authenticatedRequest(`/products/${productId}/images/${imageId}`, accessToken, { method: "DELETE" });

export const adjustInventory = (accessToken, variantId, quantity, movementType, reason) => {
  const params = new URLSearchParams({ quantity, movementType, reason });
  return authenticatedRequest(`/inventory/variants/${variantId}/adjust?${params}`, accessToken, { method: "POST" });
};

export const getAdminOrders = (accessToken) =>
  authenticatedRequest("/orders/admin/all?size=200", accessToken);

export const updateAdminOrderStatus = (accessToken, orderId, status, notes) =>
  authenticatedRequest(`/orders/admin/${orderId}/status`, accessToken, {
    method: "PATCH", body: JSON.stringify({ status, notes }),
  });

export const createShipment = (accessToken, orderId, shipment) =>
  authenticatedRequest(`/shipments/orders/${orderId}`, accessToken, {
    method: "POST", body: JSON.stringify(shipment),
  });

export const updateShipmentStatus = (accessToken, shipmentId, status) =>
  authenticatedRequest(`/shipments/${shipmentId}/status`, accessToken, {
    method: "PATCH", body: JSON.stringify({ status }),
  });

export const getInventoryMovements = (accessToken, variantId) =>
  authenticatedRequest(`/inventory/variants/${variantId}/movements?size=100`, accessToken);

export const getAdminCustomers = (accessToken) =>
  authenticatedRequest("/admin/customers?size=200", accessToken);

export const setCustomerActive = (accessToken, userId, active) =>
  authenticatedRequest(`/admin/customers/${userId}/active?active=${active}`, accessToken, { method: "PATCH" });

export const getProductReviews = async (productId) => {
  const response = await fetch(`${API_URL}/reviews/products/${productId}?size=100&sort=createdAt,desc`);
  return parseResponse(response);
};

export const getMyProductReview = (accessToken, productId) =>
  authenticatedRequest(`/reviews/products/${productId}/mine`, accessToken);
export const getReviewableVariants = (accessToken, productId) =>
  authenticatedRequest(`/reviews/products/${productId}/reviewable-variants`, accessToken);

export const createReview = (accessToken, review) =>
  authenticatedRequest("/reviews", accessToken, { method: "POST", body: JSON.stringify(review) });

export const updateReview = (accessToken, reviewId, review) =>
  authenticatedRequest(`/reviews/${reviewId}`, accessToken, { method: "PUT", body: JSON.stringify(review) });

export const deleteReview = (accessToken, reviewId) =>
  authenticatedRequest(`/reviews/${reviewId}`, accessToken, { method: "DELETE" });

export const getMyOrders = (accessToken) =>
  authenticatedRequest("/orders?size=100&sort=purchasedAt,desc", accessToken);

export const getMyReturns = (accessToken) => authenticatedRequest("/returns?size=100", accessToken);
export const createReturn = (accessToken, request) => authenticatedRequest("/returns", accessToken, { method: "POST", body: JSON.stringify(request) });
export const cancelReturn = (accessToken, returnId) => authenticatedRequest(`/returns/${returnId}/cancel`, accessToken, { method: "PATCH" });
export const getAdminReturns = (accessToken) => authenticatedRequest("/returns/admin/all?size=200", accessToken);
export const updateReturnStatus = (accessToken, returnId, status, adminComments, itemConditions) => authenticatedRequest(`/returns/admin/${returnId}/status`, accessToken, { method: "PATCH", body: JSON.stringify({ status, adminComments, itemConditions }) });
export const processRefund = (accessToken, paymentId, refundAmount, reason, returnId) => authenticatedRequest(`/refunds/payments/${paymentId}`, accessToken, { method: "POST", body: JSON.stringify({ refundAmount, reason, returnId }) });
export const getWishlist = (accessToken) => authenticatedRequest("/wishlists", accessToken);
export const addWishlistItem = (accessToken, productId) => authenticatedRequest(`/wishlists/items/${productId}`, accessToken, { method: "POST" });
export const removeWishlistItem = (accessToken, productId) => authenticatedRequest(`/wishlists/items/${productId}`, accessToken, { method: "DELETE" });
