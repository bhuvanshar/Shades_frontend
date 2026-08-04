import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addCartItem, addWishlistItem, getCart, getStoreProducts, getWishlist, removeCartItem, removeWishlistItem, updateCartItem } from "../services/api";
import { useAuth } from "./AuthContext";

export const StoreContext = createContext(null);
const storefrontCategories = ["All", "Men", "Women", "Unisex", "Accessory"];

const mapProduct = (product) => {
  const variants = (product.variants || []).filter((variant) => variant.isActive);
  const firstVariant = variants.find((variant) => Number(variant.quantityAvailable) > 0) || variants[0];
  const prices = variants.map((variant) => Number(variant.price)).filter(Number.isFinite);
  const primaryImage = product.images?.find((image) => image.isPrimary)
    || product.images?.find((image) => !image.variantId)
    || product.images?.[0];
  return {
    _id: String(product.productId),
    productId: product.productId,
    name: product.productName,
    brand: product.brand,
    description: product.productDescription || "",
    price: prices.length ? Math.min(...prices) : Number(product.basePrice),
    image: primaryImage?.imageUrl || "",
    imageAlt: primaryImage?.altText || product.productName,
    images: product.images || [],
    color: firstVariant?.attributes?.color || firstVariant?.variantName || "",
    category: product.categories?.[0]?.categoryName || "Uncategorised",
    categories: product.categories || [],
    variants,
    defaultVariantId: firstVariant?.variantId,
    available: variants.some((variant) => Number(variant.quantityAvailable) > 0),
    attributes: product.attributes || {},
    isNew: product.createdAt ? Date.now() - new Date(product.createdAt).getTime() < 30 * 86400000 : false,
  };
};

const StoreContextProvider = ({ children }) => {
  const { accessToken, user, isAdmin } = useAuth();
  const customerId = accessToken && user && !isAdmin ? user.userId : null;
  const [product_list, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");
  const [cartItems, setCartItems] = useState({});
  const [appliedOffer, setAppliedOffer] = useState(null);
  const [wishlistItems, setWishlistItems] = useState([]);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [cartError, setCartError] = useState("");
  const [cartOperations, setCartOperations] = useState(0);
  const previousCustomerRef = useRef(null);
  const cartItemsRef = useRef({});
  const cartMutationQueueRef = useRef(Promise.resolve());

  const replaceCartItems = useCallback((next) => {
    cartItemsRef.current = typeof next === "function" ? next(cartItemsRef.current) : next;
    setCartItems(cartItemsRef.current);
  }, []);

  const refreshProducts = useCallback(() => {
    setProductsLoading(true);
    setProductsError("");
    getStoreProducts()
      .then((page) => setProducts((page.content || []).map(mapProduct)))
      .catch((error) => setProductsError(error.message))
      .finally(() => setProductsLoading(false));
  }, []);

  useEffect(() => {
    refreshProducts();
    window.addEventListener("shades:products-changed", refreshProducts);
    return () => window.removeEventListener("shades:products-changed", refreshProducts);
  }, [refreshProducts]);

  useEffect(() => {
    if (!customerId) { setWishlistItems([]); return; }
    let active = true; setWishlistLoading(true);
    getWishlist(accessToken).then((wishlist) => { if (active) setWishlistItems(wishlist.items || []); })
      .catch(() => { if (active) setWishlistItems([]); })
      .finally(() => { if (active) setWishlistLoading(false); });
    return () => { active = false; };
  }, [accessToken, customerId]);

  useEffect(() => {
    const currentCustomer = customerId == null ? null : String(customerId);
    if (!currentCustomer) {
      if (previousCustomerRef.current) { replaceCartItems({}); setAppliedOffer(null); }
      previousCustomerRef.current = null;
      return;
    }
    if (previousCustomerRef.current && previousCustomerRef.current !== currentCustomer) {
      replaceCartItems({}); setAppliedOffer(null);
    }
    previousCustomerRef.current = currentCustomer;
  }, [customerId, replaceCartItems]);

  useEffect(() => {
    if (!customerId) return;
    let active = true;
    const localSnapshot = { ...cartItemsRef.current };
    const toState = (cart) => Object.fromEntries((cart.items || []).map((line) => [
      `${line.productId}:${line.variantId}`, line.quantity,
    ]));
    const synchronize = async () => {
      setCartOperations((count) => count + 1);
      try {
        let remote = await getCart(accessToken);
        if (Object.keys(localSnapshot).length > 0) {
          for (const [key, quantity] of Object.entries(localSnapshot)) {
            const variantId = Number(key.split(":")[1]);
            if (variantId) remote = await addCartItem(accessToken, variantId, quantity);
          }
        }
        if (active) { replaceCartItems(toState(remote)); setCartError(""); }
      } catch (error) {
        if (active) {
          setCartError(error.message);
          try {
            const authoritative = await getCart(accessToken);
            if (active) replaceCartItems(toState(authoritative));
          } catch {
            // Keep the optimistic snapshot when even reconciliation is unavailable.
          }
        }
      } finally {
        setCartOperations((count) => Math.max(0, count - 1));
      }
    };
    synchronize();
    return () => { active = false; };
    // Authentication changes trigger synchronization; cart changes must not refetch recursively.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, customerId, replaceCartItems]);

  const categories = useMemo(() => storefrontCategories, []);
  const cartStateFromResponse = (cart) => Object.fromEntries((cart.items || []).map((line) => [`${line.productId}:${line.variantId}`, line.quantity]));
  const reconcileCart = () => getCart(accessToken).then((cart) => replaceCartItems(cartStateFromResponse(cart)));
  const enqueueCartMutation = (operation) => {
    setCartOperations((count) => count + 1);
    const queued = cartMutationQueueRef.current.then(operation).catch(async (error) => {
      setCartError(error.message);
      await reconcileCart().catch(() => undefined);
    }).finally(() => setCartOperations((count) => Math.max(0, count - 1)));
    cartMutationQueueRef.current = queued.catch(() => undefined);
    return queued;
  };
  const cartKey = (itemId, variantId) => variantId ? `${itemId}:${variantId}` : String(itemId);
  const addToCart = (itemId, variantId) => {
    setAppliedOffer(null); setCartError("");
    const key = cartKey(itemId, variantId);
    replaceCartItems((previous) => ({ ...previous, [key]: (previous[key] || 0) + 1 }));
    if (accessToken && variantId) enqueueCartMutation(() => addCartItem(accessToken, variantId, 1));
  };
  const removeFromCart = (itemId, variantId) => {
    setAppliedOffer(null); setCartError("");
    const key = cartKey(itemId, variantId); const nextQuantity = Math.max(0, (cartItemsRef.current[key] || 0) - 1);
    replaceCartItems((previous) => { if (nextQuantity <= 0) { const updated = { ...previous }; delete updated[key]; return updated; } return { ...previous, [key]: nextQuantity }; });
    if (accessToken && variantId) {
      enqueueCartMutation(() => nextQuantity <= 0 ? removeCartItem(accessToken, variantId) : updateCartItem(accessToken, variantId, nextQuantity));
    }
  };
  const removeLineFromCart = (itemId, variantId) => {
    setAppliedOffer(null); setCartError("");
    const key = cartKey(itemId, variantId);
    replaceCartItems((previous) => { const updated = { ...previous }; delete updated[key]; return updated; });
    if (accessToken && variantId) enqueueCartMutation(() => removeCartItem(accessToken, variantId));
  };
  const getCartCount = () => Object.values(cartItems).reduce((sum, count) => sum + count, 0);
  const getTotalCartAmount = () => Object.entries(cartItems).reduce((total, [key, count]) => { const [id, variantId] = key.split(":"); const product = product_list.find((item) => item._id === id); const variant = variantId ? product?.variants.find((item) => String(item.variantId) === variantId) : null; return total + (product ? Number(variant?.price ?? product.price) * count : 0); }, 0);
  const isWishlisted = (productId) => wishlistItems.some((item) => String(item.productId) === String(productId));
  const toggleWishlist = async (productId) => {
    if (!accessToken) throw new Error("Please sign in to save products.");
    const wishlist = isWishlisted(productId)
      ? await removeWishlistItem(accessToken, productId)
      : await addWishlistItem(accessToken, productId);
    setWishlistItems(wishlist.items || []);
    return wishlist;
  };

  const clearCartState = () => { replaceCartItems({}); setAppliedOffer(null); setCartError(""); };

  return <StoreContext.Provider value={{ product_list, productsLoading, productsError, refreshProducts, categories, cartItems, setCartItems:replaceCartItems, addToCart, removeFromCart, removeLineFromCart, getCartCount, getTotalCartAmount, appliedOffer, setAppliedOffer, cartError, cartSyncing: cartOperations > 0, clearCartState, wishlistItems, wishlistLoading, isWishlisted, toggleWishlist }}>{children}</StoreContext.Provider>;
};

export default StoreContextProvider;
