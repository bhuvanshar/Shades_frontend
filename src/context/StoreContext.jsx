import { createContext, useEffect, useMemo, useState } from "react";
import { getStoreProducts } from "../services/api";

export const StoreContext = createContext(null);

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
  const [product_list, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");
  const [cartItems, setCartItems] = useState({});

  useEffect(() => {
    getStoreProducts()
      .then((page) => setProducts((page.content || []).map(mapProduct)))
      .catch((error) => setProductsError(error.message))
      .finally(() => setProductsLoading(false));
  }, []);

  const categories = useMemo(() => ["All", ...new Set(product_list.flatMap((product) => product.categories.map((category) => category.categoryName)))], [product_list]);
  const cartKey = (itemId, variantId) => variantId ? `${itemId}:${variantId}` : String(itemId);
  const addToCart = (itemId, variantId) => setCartItems((previous) => { const key = cartKey(itemId, variantId); return { ...previous, [key]: (previous[key] || 0) + 1 }; });
  const removeFromCart = (itemId, variantId) => setCartItems((previous) => { const key = cartKey(itemId, variantId); const count = (previous[key] || 0) - 1; if (count <= 0) { const updated = { ...previous }; delete updated[key]; return updated; } return { ...previous, [key]: count }; });
  const getCartCount = () => Object.values(cartItems).reduce((sum, count) => sum + count, 0);
  const getTotalCartAmount = () => Object.entries(cartItems).reduce((total, [key, count]) => { const [id, variantId] = key.split(":"); const product = product_list.find((item) => item._id === id); const variant = variantId ? product?.variants.find((item) => String(item.variantId) === variantId) : null; return total + (product ? Number(variant?.price ?? product.price) * count : 0); }, 0);

  return <StoreContext.Provider value={{ product_list, productsLoading, productsError, categories, cartItems, setCartItems, addToCart, removeFromCart, getCartCount, getTotalCartAmount }}>{children}</StoreContext.Provider>;
};

export default StoreContextProvider;
