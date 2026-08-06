import React, { useContext, useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import "./ProductDetail.css";
import { StoreContext, variantLabel } from "../../context/StoreContext";
import { assets } from "../../assets/assets";
import ProductReviews from "../../components/ProductReviews/ProductReviews";
import { useAuth } from "../../context/AuthContext";

export default function ProductDetail() {
  const { id } = useParams();
  const { product_list, productsLoading, cartItems, addToCart, removeFromCart, isWishlisted, toggleWishlist } = useContext(StoreContext);
  const { user } = useAuth();
  const navigate = useNavigate();
  const product = product_list.find((item) => item._id === id);
  const [activeTab, setActiveTab] = useState("description");
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [activeImage, setActiveImage] = useState("");

  useEffect(() => {
    if (!product) return;
    const firstVariant = product.variants?.find((variant) => variant.variantId === product.defaultVariantId)
      || product.variants?.find((variant) => Number(variant.quantityAvailable) > 0) || product.variants?.[0];
    setSelectedVariantId(firstVariant?.variantId || null);
    const firstImage = product.images?.find((image) => image.isPrimary)
      || product.images?.find((image) => !image.variantId)
      || product.images?.find((image) => image.variantId === firstVariant?.variantId)
      || product.images?.[0];
    setActiveImage(firstImage?.imageUrl || product.image);
  }, [product]);

  // The primary photo is a view of the product, not a purchasable option: it only
  // drives the hero image, while selectedVariant stays the single purchase target.
  // A stale selectedVariantId (kept across a related-product link) resolves to this
  // product's default variant rather than to whichever variant happens to be first.
  const selectedVariant = product?.variants?.find((variant) => variant.variantId === selectedVariantId)
    || product?.variants?.find((variant) => variant.variantId === product?.defaultVariantId)
    || product?.variants?.[0];
  const mainImage = product?.images?.find((image) => image.isPrimary)
    || product?.images?.find((image) => !image.variantId) || product?.images?.[0];
  const viewingMain = activeImage === (mainImage?.imageUrl || product?.image);
  // variantLabel is shared with the listing, the wishlist and the bag — see StoreContext.
  const hasVariantPhotos = Boolean(product?.images?.some((image) => image.variantId));
  const gallery = useMemo(() => {
    if (!product) return [];
    const variantImages = product.images.filter((image) => image.variantId === selectedVariant?.variantId);
    const generalImages = product.images.filter((image) => !image.variantId);
    return variantImages.length ? [...variantImages, ...generalImages] : generalImages.length ? generalImages : product.images;
  }, [product, selectedVariant]);
  const chooseVariant = (variant) => {
    setSelectedVariantId(variant.variantId);
    const image = product.images.find((item) => item.variantId === variant.variantId) || mainImage;
    setActiveImage(image?.imageUrl || product.image);
  };
  const showMainProduct = () => setActiveImage(mainImage?.imageUrl || product.image);

  if (productsLoading) return <div className="container pd-message">Loading product…</div>;
  if (!product) return <div className="container pd-message"><h2>Product not found</h2><Link to="/" className="back-link">← Back to shop</Link></div>;

  const key = selectedVariant ? `${id}:${selectedVariant.variantId}` : id;
  const count = cartItems[key] || 0;
  const related = product_list.filter((item) => item.category === product.category && item._id !== id).slice(0, 4);
  const color = variantLabel(selectedVariant) || product.color;
  const available = Number(selectedVariant?.quantityAvailable || 0);
  const bagCount = (variant) => cartItems[`${id}:${variant.variantId}`] || 0;
  // A colour name is not a unique variant identifier; fall back to the SKU to tell
  // two same-coloured variants apart wherever one is named.
  const labelUses = product.variants.reduce((counts, variant) => ({ ...counts, [variantLabel(variant)]: (counts[variantLabel(variant)] || 0) + 1 }), {});
  const ambiguous = (variant) => labelUses[variantLabel(variant)] > 1;
  const addLabel = selectedVariant && ambiguous(selectedVariant) ? `${color} (${selectedVariant.sku})` : color;
  const saved = isWishlisted(id);
  const saveProduct = async () => { if (!user) return navigate("/signin"); try { await toggleWishlist(id); } catch (error) { window.alert(error.message); } };

  return <div className="product-detail"><div className="container"><Link to="/" className="back-link">← Back to shop</Link><div className="pd-layout"><div className="pd-image-section"><div className="pd-main-image">{activeImage ? <img src={activeImage} alt={product.imageAlt || product.name} /> : <div className="pd-image-placeholder">SHADES WORLD</div>}{product.isNew && <span className="pd-badge">New</span>}</div>{hasVariantPhotos && <button type="button" className="pd-photo-toggle" disabled={viewingMain} onClick={showMainProduct}>{product.image && <img src={product.image} alt="" />}<span>{viewingMain ? "Showing the primary photo" : "View the primary photo"}</span></button>}{gallery.length > 1 && <div className="pd-gallery">{gallery.map((image) => <button key={image.imageId} className={activeImage === image.imageUrl ? "active" : ""} onClick={() => setActiveImage(image.imageUrl)}><img src={image.imageUrl} alt={image.altText || product.name} /></button>)}</div>}</div><div className="pd-info-section"><span className="pd-category">{product.categories.map((category) => category.categoryName).join(" · ") || product.category}</span><h1 className="pd-title">{product.name}</h1><p className="pd-brand">{product.brand}</p><p className="pd-price">₹{Number(selectedVariant?.price ?? product.price).toLocaleString("en-IN")}</p>
    {product.variants.length > 0 && <div className="pd-variants"><div className="pd-variant-label"><span>Choose color</span><strong>{color}</strong></div><div className="pd-variant-options">{product.variants.map((variant) => { const variantColor = variantLabel(variant); const variantImage = product.images.find((item) => item.variantId === variant.variantId); const image = variantImage || mainImage; const inBag = bagCount(variant); return <button key={variant.variantId} className={selectedVariant?.variantId === variant.variantId ? "active" : ""} onClick={() => chooseVariant(variant)} disabled={variant.quantityAvailable <= 0 && inBag === 0}>{image ? <img src={image.imageUrl} alt={`${product.name} ${variantColor}`} /> : <span className="pd-variant-no-image">No photo</span>}<span>{variantColor}</span>{ambiguous(variant) && <small>{variant.sku}</small>}{!variantImage && image && <small>Product photo</small>}{variant.quantityAvailable <= 0 && <small>Out of stock</small>}{inBag > 0 && <small className="pd-variant-in-bag">{inBag} in bag</small>}</button>; })}</div><p className={`pd-stock ${available <= (selectedVariant?.lowStockThreshold || 0) ? "low" : ""}`}>{available > 0 ? `${available} in stock · SKU ${selectedVariant.sku}` : "Currently unavailable"}</p></div>}
    <div className="pd-actions"><button className={`pd-wishlist-btn ${saved ? "saved" : ""}`} onClick={saveProduct}>{saved ? "♥ Saved to wishlist" : "♡ Save to wishlist"}</button>{count === 0 ? <button className="pd-add-btn" disabled={available <= 0} onClick={() => addToCart(id, selectedVariant?.variantId)}>{available > 0 ? `Add ${addLabel} to bag` : "Out of stock"}</button> : <div className="pd-qty-row"><div className="pd-qty-control"><button aria-label={`Remove one ${color} from bag`} onClick={() => removeFromCart(id, selectedVariant?.variantId)}><img src={assets.remove_icon_red} alt="Remove" /></button><span>{count}</span><button aria-label={`Add one more ${color} to bag`} disabled={count >= available} onClick={() => addToCart(id, selectedVariant?.variantId)}><img src={assets.add_icon_green} alt="Add" /></button></div><Link to="/cart" className="pd-view-cart">View bag →</Link></div>}</div>
    <div className="pd-tabs"><button className={activeTab === "description" ? "active" : ""} onClick={() => setActiveTab("description")}>Description</button><button className={activeTab === "details" ? "active" : ""} onClick={() => setActiveTab("details")}>Details</button><button className={activeTab === "shipping" ? "active" : ""} onClick={() => setActiveTab("shipping")}>Shipping</button></div><div className="pd-tab-content">{activeTab === "description" && <p>{product.description || "No description available."}</p>}{activeTab === "details" && <ul>{Object.entries(product.attributes).map(([name, value]) => <li key={name}>{name.replaceAll("_", " ")}: {value}</li>)}</ul>}{activeTab === "shipping" && <div><p>Free shipping on orders of ₹500 or more.</p><p>Standard delivery: 3–5 business days.</p><p>30-day hassle-free returns.</p></div>}</div></div></div>
    <ProductReviews productId={id} />
    {related.length > 0 && <div className="pd-related"><h2>You may also like</h2><div className="pd-related-grid">{related.map((item) => <Link to={`/product/${item._id}`} key={item._id} className="pd-related-card"><div className="pd-related-img"><img src={item.image} alt={item.name} /></div><p className="pd-related-name">{item.name}</p><p className="pd-related-price">₹{item.price.toLocaleString("en-IN")}</p></Link>)}</div></div>}
  </div></div>;
}
