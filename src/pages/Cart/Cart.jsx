import React, { useContext, useState } from "react";
import "./Cart.css";
import { StoreContext, resolveCartLines } from "../../context/StoreContext";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { validateCoupon } from "../../services/api";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const rowLabel = (line) => (line.color ? `${line.product.name} in ${line.color}` : line.product.name);

const Cart = () => {
  const { cartItems, product_list, productsLoading, productsError, refreshProducts, removeFromCart,
    removeLineFromCart, addToCart, getTotalCartAmount, appliedOffer, setAppliedOffer, cartSyncing } = useContext(StoreContext);
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [promoCode, setPromoCode] = useState(appliedOffer?.couponCode || "");
  const [promoError, setPromoError] = useState("");
  const [applying, setApplying] = useState(false);

  // Nothing is filtered: a line the catalogue cannot resolve becomes a degraded row with a
  // working Remove, because the only way to delete a line is a control inside its own row.
  const lines = resolveCartLines(cartItems, product_list);
  const unavailable = lines.filter((line) => !line.resolved);
  const catalogueLoading = product_list.length === 0 && productsLoading;
  const catalogueFailed = product_list.length === 0 && !productsLoading && Boolean(productsError);

  const subtotal = getTotalCartAmount();
  const itemQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
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
      {lines.length === 0 ? (
        <div className="cart-empty"><p>Your bag is empty</p><Link to="/" className="cart-empty-cta">Browse eyewear</Link></div>
      ) : catalogueLoading ? (
        <div className="cart-status" role="status"><p>Loading the {itemQuantity} {itemQuantity === 1 ? "item" : "items"} in your bag…</p></div>
      ) : catalogueFailed ? (
        <div className="cart-status cart-status-error" role="alert">
          <p>Your bag still holds {itemQuantity} {itemQuantity === 1 ? "item" : "items"}, but the catalogue could not be loaded, so we cannot price {itemQuantity === 1 ? "it" : "them"} yet.</p>
          <button type="button" onClick={refreshProducts}>Try again</button>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="cart-items">{lines.map((line) => (line.resolved ? (
            <div className="cart-item" key={line.key}>
              <Link to={`/product/${line.productId}`} className="cart-item-image"><img src={line.image} alt={line.product.name} /></Link>
              <div className="cart-item-info">
                <Link to={`/product/${line.productId}`}><p className="cart-item-name">{line.product.name}</p></Link>
                <p className="cart-item-color">{line.color}{line.variant?.sku && ` · ${line.variant.sku}`}</p>
                <p className="cart-item-price">{money(line.price)}</p>
              </div>
              <div className="cart-item-qty">
                <button aria-label={`Decrease quantity of ${rowLabel(line)}`} onClick={() => removeFromCart(line.productId, line.variantId)}>−</button>
                <span aria-live="polite" aria-label={`${line.quantity} in bag`}>{line.quantity}</span>
                <button aria-label={line.quantityAvailable === null ? `Stock for ${rowLabel(line)} is unknown`
                  : line.quantity >= line.quantityAvailable ? `No more ${rowLabel(line)} available`
                  : `Increase quantity of ${rowLabel(line)}`}
                  disabled={line.quantityAvailable === null || line.quantity >= line.quantityAvailable}
                  onClick={() => addToCart(line.productId, line.variantId)}>+</button>
              </div>
              <p className="cart-item-total">{money(line.price * line.quantity)}</p>
              <button className="cart-item-remove" onClick={() => removeLineFromCart(line.productId, line.variantId)}
                aria-label={`Remove ${rowLabel(line)}`}>×</button>
            </div>
          ) : (
            <div className="cart-item cart-item-unavailable" key={line.key}>
              <span className="cart-item-image cart-item-image-missing" aria-hidden="true">SW</span>
              <div className="cart-item-info">
                <p className="cart-item-name">{line.product ? <Link to={`/product/${line.productId}`}>{line.title}</Link> : line.title}</p>
                <p className="cart-item-color">{line.unavailableReason}{line.variantId ? ` · ref ${line.variantId}` : ""}</p>
                <p className="cart-item-price">Price unavailable</p>
              </div>
              <div className="cart-item-qty cart-item-qty-static"><span>{line.quantity} in bag</span></div>
              <p className="cart-item-total">—</p>
              <button className="cart-item-remove" onClick={() => removeLineFromCart(line.productId, line.variantId)}
                aria-label={`Remove ${line.title}${line.variantId ? ` (ref ${line.variantId})` : ""} from bag`}>×</button>
            </div>
          )))}</div>

          <div className="cart-summary">
            <h2>Order summary</h2>
            {unavailable.length > 0 && <p className="cart-summary-alert" role="alert">
              {unavailable.length === 1 ? "1 item in your bag is" : `${unavailable.length} items in your bag are`} no longer available. {unavailable.length === 1 ? "It is" : "They are"} excluded from this total — remove {unavailable.length === 1 ? "it" : "them"} to check out.
            </p>}
            <div className="cart-summary-row"><span>Items</span><span>{itemQuantity} units</span></div>
            <div className="cart-summary-row"><span>Subtotal</span><span>{money(subtotal)}</span></div>
            {appliedOffer && <div className="cart-summary-row cart-discount"><span>Offer ({appliedOffer.couponCode})</span><span>−{money(discount)}</span></div>}
            <div className="cart-summary-row"><span>Estimated tax</span><span>{money(tax)}</span></div>
            <div className="cart-summary-row"><span>Shipping</span><span>{deliveryFee === 0 ? "Free" : money(deliveryFee)}</span></div>
            {deliveryFee > 0 && <p className="cart-free-ship-hint">Add {money(500 - subtotal)} more for free shipping</p>}
            <div className="cart-summary-divider" />
            <div className="cart-summary-row cart-summary-total"><span>Estimated total</span><span>{money(total)}</span></div>
            <button className="cart-checkout-btn" disabled={unavailable.length > 0} onClick={() => navigate("/order")}>
              {unavailable.length > 0 ? "Remove unavailable items to continue" : "Proceed to checkout"}</button>
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
