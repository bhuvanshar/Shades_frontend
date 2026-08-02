import React, { useContext } from "react";
import "./PlaceOrder.css";
import { StoreContext } from "../../context/StoreContext";
import { Link } from "react-router-dom";

const PlaceOrder = () => {
  const { getTotalCartAmount, appliedOffer } = useContext(StoreContext);
  const subtotal = getTotalCartAmount();
  const discount = Number(appliedOffer?.calculatedDiscount || 0);
  const deliveryFee = subtotal === 0 ? 0 : subtotal >= 1500 ? 0 : 99;
  const total = Math.max(0, subtotal - discount + deliveryFee);

  return (
    <div className="place-order-page">
      <div className="container">
        <Link to="/cart" className="back-link">← Back to bag</Link>
        <h1 className="checkout-title">Checkout</h1>

        <form className="checkout-layout">
          <div className="checkout-left">
            <h2>Delivery information</h2>
            <div className="field-row">
              <input type="text" placeholder="First name" required />
              <input type="text" placeholder="Last name" required />
            </div>
            <input type="email" placeholder="Email address" required />
            <input type="tel" placeholder="Phone number" required />
            <input type="text" placeholder="Street address" required />
            <div className="field-row">
              <input type="text" placeholder="City" required />
              <input type="text" placeholder="State" required />
            </div>
            <div className="field-row">
              <input type="text" placeholder="PIN code" required />
              <input type="text" placeholder="Country" required />
            </div>
          </div>

          <div className="checkout-right">
            <div className="checkout-summary">
              <h2>Order summary</h2>
              <div className="checkout-row">
                <span>Subtotal</span>
                <span>₹{subtotal.toLocaleString("en-IN")}</span>
              </div>
              <div className="checkout-row">
                <span>Shipping</span>
                <span>{deliveryFee === 0 ? "Free" : `₹${deliveryFee}`}</span>
              </div>
              {appliedOffer && <div className="checkout-row checkout-discount"><span>Offer ({appliedOffer.couponCode})</span><span>−₹{discount.toLocaleString("en-IN")}</span></div>}
              <div className="checkout-divider" />
              <div className="checkout-row checkout-total-row">
                <span>Total</span>
                <span>₹{total.toLocaleString("en-IN")}</span>
              </div>
              <button type="submit" className="checkout-pay-btn">
                Place order
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PlaceOrder;
