import React, { useContext, useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import "./ProductDetail.css";
import { StoreContext } from "../../context/StoreContext";
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
  const [viewingMain, setViewingMain] = useState(true);

  useEffect(() => {
    if (!product) return;
    const firstVariant = product.variants?.[0];
    setSelectedVariantId(firstVariant?.variantId || null);
    const firstImage = product.images?.find((image) => image.isPrimary)
      || product.images?.find((image) => !image.variantId)
      || product.images?.find((image) => image.variantId === firstVariant?.variantId)
      || product.images?.[0];
    setActiveImage(firstImage?.imageUrl || product.image);
    setViewingMain(true);
  }, [product]);

  const selectedVariant = product?.variants?.find((variant) => variant.variantId === selectedVariantId) || product?.variants?.[0];
  const gallery = useMemo(() => {
    if (!product) return [];
    const variantImages = product.images.filter((image) => image.variantId === selectedVariant?.variantId);
    const generalImages = product.images.filter((image) => !image.variantId);
    return variantImages.length ? [...variantImages, ...generalImages] : generalImages.length ? generalImages : product.images;
  }, [product, selectedVariant]);
  const chooseVariant = (variant) => {
    setViewingMain(false);
    setSelectedVariantId(variant.variantId);
    const image = product.images.find((item) => item.variantId === variant.variantId)
      || product.images.find((item) => item.isPrimary) || product.images[0];
    setActiveImage(image?.imageUrl || product.image);
  };
  const showMainProduct = () => {
    const image = product.images.find((item) => item.isPrimary)
      || product.images.find((item) => !item.variantId) || product.images[0];
    setActiveImage(image?.imageUrl || product.image);
    setViewingMain(true);
  };

  if (productsLoading) return <div className="container pd-message">Loading product…</div>;
  if (!product) return <div className="container pd-message"><h2>Product not found</h2><Link to="/" className="back-link">← Back to shop</Link></div>;

  const key = selectedVariant ? `${id}:${selectedVariant.variantId}` : id;
  const count = cartItems[key] || 0;
  const related = product_list.filter((item) => item.category === product.category && item._id !== id).slice(0, 4);
  const color = selectedVariant?.attributes?.color || selectedVariant?.variantName || product.color;
  const available = Number(selectedVariant?.quantityAvailable || 0);
  const saved = isWishlisted(id);
  const saveProduct = async () => { if (!user) return navigate("/signin"); try { await toggleWishlist(id); } catch (error) { window.alert(error.message); } };

  return <div className="product-detail"><div className="container"><Link to="/" className="back-link">← Back to shop</Link><div className="pd-layout"><div className="pd-image-section"><div className="pd-main-image">{activeImage ? <img src={activeImage} alt={product.imageAlt || product.name} /> : <div className="pd-image-placeholder">SHADES WORLD</div>}{product.isNew && <span className="pd-badge">New</span>}</div>{gallery.length > 1 && <div className="pd-gallery">{gallery.map((image) => <button key={image.imageId} className={activeImage === image.imageUrl ? "active" : ""} onClick={() => setActiveImage(image.imageUrl)}><img src={image.imageUrl} alt={image.altText || product.name} /></button>)}</div>}</div><div className="pd-info-section"><span className="pd-category">{product.categories.map((category) => category.categoryName).join(" · ") || product.category}</span><h1 className="pd-title">{product.name}</h1><p className="pd-brand">{product.brand}</p><p className="pd-price">₹{Number(selectedVariant?.price ?? product.price).toLocaleString("en-IN")}</p>
    {product.variants.length > 0 && <div className="pd-variants"><div className="pd-variant-label"><span>Choose view or color</span><strong>{viewingMain ? product.name : color}</strong></div><div className="pd-variant-options"><button className={viewingMain ? "active" : ""} onClick={showMainProduct}>{product.image ? <img src={product.image} alt={`${product.name} main`} /> : <span className="pd-variant-no-image">No photo</span>}<span>{product.name}</span><small>Primary view</small></button>{product.variants.map((variant) => { const variantColor = variant.attributes?.color || variant.variantName || variant.sku; const variantImage = product.images.find((item) => item.variantId === variant.variantId); const fallbackImage = product.images.find((item) => item.isPrimary) || product.images.find((item) => !item.variantId) || product.images[0]; const image = variantImage || fallbackImage; return <button key={variant.variantId} className={!viewingMain && selectedVariant?.variantId === variant.variantId ? "active" : ""} onClick={() => chooseVariant(variant)} disabled={variant.quantityAvailable <= 0}>{image ? <img src={image.imageUrl} alt={`${product.name} ${variantColor}`} /> : <span className="pd-variant-no-image">No photo</span>}<span>{variantColor}</span>{!variantImage && image && <small>Product photo</small>}{variant.quantityAvailable <= 0 && <small>Out of stock</small>}</button>; })}</div><p className={`pd-stock ${available <= (selectedVariant?.lowStockThreshold || 0) ? "low" : ""}`}>{available > 0 ? `${available} in stock · SKU ${selectedVariant.sku}` : "Currently unavailable"}</p></div>}
    <div className="pd-actions"><button className={`pd-wishlist-btn ${saved ? "saved" : ""}`} onClick={saveProduct}>{saved ? "♥ Saved to wishlist" : "♡ Save to wishlist"}</button>{count === 0 ? <button className="pd-add-btn" disabled={available <= 0} onClick={() => addToCart(id, selectedVariant?.variantId)}>{available > 0 ? "Add selected color to bag" : "Out of stock"}</button> : <div className="pd-qty-row"><div className="pd-qty-control"><button onClick={() => removeFromCart(id, selectedVariant?.variantId)}><img src={assets.remove_icon_red} alt="Remove" /></button><span>{count}</span><button disabled={count >= available} onClick={() => addToCart(id, selectedVariant?.variantId)}><img src={assets.add_icon_green} alt="Add" /></button></div><Link to="/cart" className="pd-view-cart">View bag →</Link></div>}</div>
    <div className="pd-tabs"><button className={activeTab === "description" ? "active" : ""} onClick={() => setActiveTab("description")}>Description</button><button className={activeTab === "details" ? "active" : ""} onClick={() => setActiveTab("details")}>Details</button><button className={activeTab === "shipping" ? "active" : ""} onClick={() => setActiveTab("shipping")}>Shipping</button></div><div className="pd-tab-content">{activeTab === "description" && <p>{product.description || "No description available."}</p>}{activeTab === "details" && <ul>{Object.entries(product.attributes).map(([name, value]) => <li key={name}>{name.replaceAll("_", " ")}: {value}</li>)}</ul>}{activeTab === "shipping" && <div><p>Free shipping on orders above ₹1500.</p><p>Standard delivery: 3–5 business days.</p><p>30-day hassle-free returns.</p></div>}</div></div></div>
    <ProductReviews productId={id} />
    {related.length > 0 && <div className="pd-related"><h2>You may also like</h2><div className="pd-related-grid">{related.map((item) => <Link to={`/product/${item._id}`} key={item._id} className="pd-related-card"><div className="pd-related-img"><img src={item.image} alt={item.name} /></div><p className="pd-related-name">{item.name}</p><p className="pd-related-price">₹{item.price.toLocaleString("en-IN")}</p></Link>)}</div></div>}
  </div></div>;
}
