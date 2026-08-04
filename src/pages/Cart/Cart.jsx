import React, { useContext, useState } from "react";
import "./Cart.css";
import { StoreContext } from "../../context/StoreContext";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { validateCoupon } from "../../services/api";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const Cart = () => {
  const { cartItems, product_list, removeFromCart, removeLineFromCart, addToCart, getTotalCartAmount,
    appliedOffer, setAppliedOffer, cartError, cartSyncing } = useContext(StoreContext);
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [promoCode, setPromoCode] = useState(appliedOffer?.couponCode || "");
  const [promoError, setPromoError] = useState("");
  const [applying, setApplying] = useState(false);

  const lines = Object.entries(cartItems).map(([key, quantity]) => {
    const [id, variantId] = key.split(":");
    const product = product_list.find((item) => item._id === id);
    if (!product) return null;
    const variant = variantId ? product.variants.find((item) => String(item.variantId) === variantId) : null;
    const variantImage = product.images?.find((image) => String(image.variantId) === String(variant?.variantId));
    return {
      key, product, variant, quantity,
      price: Number(variant?.price ?? product.price),
      image: variantImage?.imageUrl || product.image,
      color: variant?.attributes?.color || variant?.variantName || product.color,
    };
  }).filter(Boolean);

  const subtotal = getTotalCartAmount();
  const itemQuantity = Object.values(cartItems).reduce((sum, count) => sum + count, 0);
  const discount = Math.min(subtotal, Number(appliedOffer?.calculatedDiscount || 0));
  const taxable = Math.max(0, subtotal - discount);
  const tax = Number((taxable * 0.18).toFixed(2));
  const deliveryFee = subtotal === 0 || subtotal >= 500 ? 0 : 49;
  const total = taxable + tax + deliveryFee;

  const applyPromo = async () => {
    if (!promoCode.trim()) { setPromoError("Enter an offer code."); return; }
    if (!accessToken) { setPromoError("Sign in before applying an offer."); return; }
    if (cartSyncing) { setPromoError("Please wait while your bag finishes updating."); return; }
    setApplying(true); setPromoError("");
    try {
      const offer = await validateCoupon(accessToken, promoCode.trim());
      setAppliedOffer(offer); setPromoCode(offer.couponCode);
    } catch (error) {
      setAppliedOffer(null); setPromoError(error.message);
    } finally { setApplying(false); }
  };

  return (
    <main className="cart"><div className="container">
      <Link to="/" className="back-link">← Continue shopping</Link>
      <h1 className="cart-title">Your bag</h1>
      {cartError && <p className="promo-error" role="alert">{cartError}</p>}
      {lines.length === 0 ? (
        <div className="cart-empty"><p>Your bag is empty</p><Link to="/" className="cart-empty-cta">Browse eyewear</Link></div>
      ) : (
        <div className="cart-layout">
          <div className="cart-items">{lines.map((line) => (
            <div className="cart-item" key={line.key}>
              <Link to={`/product/${line.product._id}`} className="cart-item-image"><img src={line.image} alt={line.product.name} /></Link>
              <div className="cart-item-info">
                <Link to={`/product/${line.product._id}`}><p className="cart-item-name">{line.product.name}</p></Link>
                <p className="cart-item-color">{line.color}{line.variant?.sku && ` · ${line.variant.sku}`}</p>
                <p className="cart-item-price">{money(line.price)}</p>
              </div>
              <div className="cart-item-qty">
                <button aria-label={`Decrease quantity of ${line.product.name}`} onClick={() => removeFromCart(line.product._id, line.variant?.variantId)}>−</button>
                <span aria-live="polite" aria-label={`${line.quantity} in bag`}>{line.quantity}</span>
                <button aria-label={`Increase quantity of ${line.product.name}`} disabled={line.quantity >= Number(line.variant?.quantityAvailable || Infinity)}
                  onClick={() => addToCart(line.product._id, line.variant?.variantId)}>+</button>
              </div>
              <p className="cart-item-total">{money(line.price * line.quantity)}</p>
              <button className="cart-item-remove" onClick={() => removeLineFromCart(line.product._id, line.variant?.variantId)}
                aria-label={`Remove ${line.product.name}`}>×</button>
            </div>
          ))}</div>

          <div className="cart-summary">
            <h2>Order summary</h2>
            <div className="cart-summary-row"><span>Items</span><span>{itemQuantity} units</span></div>
            <div className="cart-summary-row"><span>Subtotal</span><span>{money(subtotal)}</span></div>
            {appliedOffer && <div className="cart-summary-row cart-discount"><span>Offer ({appliedOffer.couponCode})</span><span>−{money(discount)}</span></div>}
            <div className="cart-summary-row"><span>Estimated tax</span><span>{money(tax)}</span></div>
            <div className="cart-summary-row"><span>Shipping</span><span>{deliveryFee === 0 ? "Free" : money(deliveryFee)}</span></div>
            {deliveryFee > 0 && <p className="cart-free-ship-hint">Add {money(500 - subtotal)} more for free shipping</p>}
            <div className="cart-summary-divider" />
            <div className="cart-summary-row cart-summary-total"><span>Estimated total</span><span>{money(total)}</span></div>
            <button className="cart-checkout-btn" onClick={() => navigate("/order")}>Proceed to checkout</button>
            <div className="cart-promo">
              <input aria-label="Offer code" value={promoCode} onChange={(event) => { setPromoCode(event.target.value); setPromoError(""); }} type="text" placeholder="Offer code" />
              <button onClick={applyPromo} disabled={applying || cartSyncing}>{cartSyncing ? "Updating…" : applying ? "Applying…" : "Apply"}</button>
            </div>
            {appliedOffer && <div className="promo-success"><strong>Offer applied</strong>
              <span>{appliedOffer.discountType === "PAIR_FIXED" ? `${money(appliedOffer.discountValue)} off every 2 units` : appliedOffer.message}</span>
              <button onClick={() => { setAppliedOffer(null); setPromoCode(""); }}>Remove</button></div>}
            {promoError && <p className="promo-error" role="alert">{promoError}</p>}
          </div>
        </div>
      )}
    </div></main>
  );
};

export default Cart;
