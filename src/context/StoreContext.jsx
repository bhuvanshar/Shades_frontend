import { createContext, useEffect, useMemo, useState } from "react";
import { addWishlistItem, getStoreProducts, getWishlist, removeWishlistItem } from "../services/api";
import { useAuth } from "./AuthContext";

export const StoreContext = createContext(null);
const storefrontCategories = ["All", "Men", "Women", "Unisex", "Accessory"];

const mapProduct = (product) => {
  const variants = (product.variants || []).filter((variant) => variant.isActive);
  const firstVariant = variants[0];
  const primaryImage = product.images?.find((image) => image.isPrimary)
    || product.images?.find((image) => !image.variantId)
    || product.images?.[0];
  return {
    _id: String(product.productId),
    productId: product.productId,
    name: product.productName,
    brand: product.brand,
    description: product.productDescription || "",
    price: Number(firstVariant?.price ?? product.basePrice),
    image: primaryImage?.imageUrl || "",
    imageAlt: primaryImage?.altText || product.productName,
    images: product.images || [],
    color: firstVariant?.attributes?.color || firstVariant?.variantName || "",
    category: product.categories?.[0]?.categoryName || "Uncategorised",
    categories: product.categories || [],
    variants,
    attributes: product.attributes || {},
    isNew: product.createdAt ? Date.now() - new Date(product.createdAt).getTime() < 30 * 86400000 : false,
  };
};

const StoreContextProvider = ({ children }) => {
  const { accessToken, user, isAdmin } = useAuth();
  const [product_list, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");
  const [cartItems, setCartItems] = useState({});
  const [appliedOffer, setAppliedOffer] = useState(null);
  const [wishlistItems, setWishlistItems] = useState([]);
  const [wishlistLoading, setWishlistLoading] = useState(false);

  useEffect(() => {
    getStoreProducts()
      .then((page) => setProducts((page.content || []).map(mapProduct)))
      .catch((error) => setProductsError(error.message))
      .finally(() => setProductsLoading(false));
  }, []);

  useEffect(() => {
    if (!accessToken || !user || isAdmin) { setWishlistItems([]); return; }
    let active = true; setWishlistLoading(true);
    getWishlist(accessToken).then((wishlist) => { if (active) setWishlistItems(wishlist.items || []); })
      .catch(() => { if (active) setWishlistItems([]); })
      .finally(() => { if (active) setWishlistLoading(false); });
    return () => { active = false; };
  }, [accessToken, user, isAdmin]);

  const categories = useMemo(() => storefrontCategories, []);
  const cartKey = (itemId, variantId) => variantId ? `${itemId}:${variantId}` : String(itemId);
  const addToCart = (itemId, variantId) => { setAppliedOffer(null); setCartItems((previous) => { const key = cartKey(itemId, variantId); return { ...previous, [key]: (previous[key] || 0) + 1 }; }); };
  const removeFromCart = (itemId, variantId) => { setAppliedOffer(null); setCartItems((previous) => { const key = cartKey(itemId, variantId); const count = (previous[key] || 0) - 1; if (count <= 0) { const updated = { ...previous }; delete updated[key]; return updated; } return { ...previous, [key]: count }; }); };
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

  return <StoreContext.Provider value={{ product_list, productsLoading, productsError, categories, cartItems, setCartItems, addToCart, removeFromCart, getCartCount, getTotalCartAmount, appliedOffer, setAppliedOffer, wishlistItems, wishlistLoading, isWishlisted, toggleWishlist }}>{children}</StoreContext.Provider>;
};

export default StoreContextProvider;
