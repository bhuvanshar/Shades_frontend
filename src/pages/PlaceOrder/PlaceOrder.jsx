import React, { useContext, useEffect, useMemo, useState } from "react";
import "./PlaceOrder.css";
import { StoreContext } from "../../context/StoreContext";
import { useAuth } from "../../context/AuthContext";
import { createAddress, createOrder, getAddresses, processMockPayment } from "../../services/api";
import { Link, useNavigate } from "react-router-dom";

const emptyAddress = {
  recipientName: "", phoneNumber: "", addressLine1: "", addressLine2: "",
  city: "", state: "", pincode: "", country: "India",
};

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const addBusinessDays = (start, days) => {
  const result = new Date(start); let remaining = days;
  while (remaining > 0) { result.setDate(result.getDate() + 1); if (![0, 6].includes(result.getDay())) remaining -= 1; }
  return result;
};
const shortDate = (value) => value.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

const PlaceOrder = () => {
  const { accessToken } = useAuth();
  const { cartItems, product_list, getTotalCartAmount, appliedOffer, clearCartState, getCartCount, cartSyncing } = useContext(StoreContext);
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [useNewAddress, setUseNewAddress] = useState(false);
  const [address, setAddress] = useState(emptyAddress);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState(null);

  useEffect(() => {
    let active = true;
    getAddresses(accessToken)
      .then((values) => {
        if (!active) return;
        setAddresses(values || []);
        const preferred = values?.find((value) => value.isDefault) || values?.[0];
        if (preferred) setSelectedAddressId(String(preferred.addressId));
        else setUseNewAddress(true);
      })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoadingAddresses(false); });
    return () => { active = false; };
  }, [accessToken]);

  const subtotal = getTotalCartAmount();
  const discount = Math.min(subtotal, Number(appliedOffer?.calculatedDiscount || 0));
  const taxable = Math.max(0, subtotal - discount);
  const tax = Number((taxable * 0.18).toFixed(2));
  const shipping = subtotal === 0 || subtotal >= 500 ? 0 : 49;
  const estimatedTotal = taxable + tax + shipping;
  const itemCount = getCartCount();
  const orderLines = useMemo(() => Object.entries(cartItems).map(([key, quantity]) => {
    const [productId, variantId] = key.split(":");
    const product = product_list.find((item) => item._id === productId);
    if (!product) return null;
    const variant = product.variants?.find((item) => String(item.variantId) === String(variantId));
    const image = product.images?.find((item) => String(item.variantId) === String(variantId))?.imageUrl || product.image;
    return { key, quantity, product, variant, image, price: Number(variant?.price ?? product.price),
      color: variant?.attributes?.color || variant?.variantName || product.color };
  }).filter(Boolean), [cartItems, product_list]);
  const selectedAddress = useNewAddress ? address
    : addresses.find((item) => String(item.addressId) === selectedAddressId);
  const deliveryStart = shortDate(addBusinessDays(new Date(), 3));
  const deliveryEnd = shortDate(addBusinessDays(new Date(), 5));
  const canSubmit = useMemo(() => itemCount > 0 && !submitting && !loadingAddresses && !cartSyncing
    && reviewConfirmed && (useNewAddress || selectedAddressId), [itemCount, submitting, loadingAddresses, cartSyncing, reviewConfirmed, useNewAddress, selectedAddressId]);

  useEffect(() => { setReviewConfirmed(false); }, [estimatedTotal, itemCount]);

  const changeAddress = (field) => (event) => {
    setReviewConfirmed(false);
    setAddress((current) => ({ ...current, [field]: event.target.value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true); setError("");
    let createdOrder = pendingOrderId ? { orderId: pendingOrderId } : null;
    try {
      if (!createdOrder) {
        let shippingAddressId = Number(selectedAddressId);
        if (useNewAddress) {
          const savedAddress = await createAddress(accessToken, {
            ...address, addressType: "SHIPPING", isDefault: addresses.length === 0,
          });
          shippingAddressId = savedAddress.addressId;
          setAddresses((current) => [savedAddress, ...current]);
          setSelectedAddressId(String(savedAddress.addressId));
          setUseNewAddress(false);
        }
        createdOrder = await createOrder(accessToken, {
          shippingAddressId,
          billingAddressId: shippingAddressId,
          couponCode: appliedOffer?.couponCode || null,
          expectedTotalAmount: Number(estimatedTotal.toFixed(2)),
        });
        setPendingOrderId(createdOrder.orderId);
      }
      await processMockPayment(accessToken, createdOrder.orderId);
      setPendingOrderId(null);
      clearCartState();
      navigate("/my-orders", { replace: true, state: { checkoutComplete: true, orderId: createdOrder.orderId } });
    } catch (requestError) {
      setError(createdOrder
        ? `Order #${createdOrder.orderId} was created, but payment confirmation was interrupted: ${requestError.message}. Use the retry button below; you will not be charged twice.`
        : requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="place-order-page">
      <div className="container">
        <Link to="/cart" className="back-link">← Back to bag</Link>
        <h1 className="checkout-title">Checkout</h1>

        <form className="checkout-layout" onSubmit={submit}>
          <div className="checkout-left">
            <h2>Delivery information</h2>
            {loadingAddresses && <p className="checkout-note">Loading saved addresses…</p>}
            {!loadingAddresses && addresses.length > 0 && (
              <div className="saved-addresses">
                {addresses.map((saved) => (
                  <label className={`saved-address ${!useNewAddress && selectedAddressId === String(saved.addressId) ? "selected" : ""}`} key={saved.addressId}>
                    <input type="radio" name="deliveryAddress" checked={!useNewAddress && selectedAddressId === String(saved.addressId)}
                      onChange={() => { setReviewConfirmed(false); setUseNewAddress(false); setSelectedAddressId(String(saved.addressId)); }} />
                    <span><strong>{saved.recipientName}</strong>{saved.isDefault && <em>Default</em>}<br />
                      {saved.addressLine1}{saved.addressLine2 && `, ${saved.addressLine2}`}<br />
                      {saved.city}, {saved.state} {saved.pincode}<br />{saved.country}{saved.phoneNumber && ` · ${saved.phoneNumber}`}</span>
                  </label>
                ))}
                <button type="button" className="new-address-toggle" onClick={() => { setReviewConfirmed(false); setUseNewAddress(true); }}>+ Use a new address</button>
              </div>
            )}

            {useNewAddress && (
              <div className="new-address-form">
                <input value={address.recipientName} onChange={changeAddress("recipientName")} type="text" placeholder="Recipient name" maxLength="255" required />
                <input value={address.phoneNumber} onChange={changeAddress("phoneNumber")} type="tel" placeholder="Phone number" maxLength="20" />
                <input value={address.addressLine1} onChange={changeAddress("addressLine1")} type="text" placeholder="Street address" maxLength="255" required />
                <input value={address.addressLine2} onChange={changeAddress("addressLine2")} type="text" placeholder="Apartment, suite, etc. (optional)" maxLength="255" />
                <div className="field-row">
                  <input value={address.city} onChange={changeAddress("city")} type="text" placeholder="City" maxLength="100" required />
                  <input value={address.state} onChange={changeAddress("state")} type="text" placeholder="State" maxLength="100" required />
                </div>
                <div className="field-row">
                  <input value={address.pincode} onChange={changeAddress("pincode")} type="text" placeholder="PIN code" maxLength="20" required />
                  <input value={address.country} onChange={changeAddress("country")} type="text" placeholder="Country" maxLength="100" required />
                </div>
                {addresses.length > 0 && <button type="button" className="new-address-toggle" onClick={() => { setReviewConfirmed(false); setUseNewAddress(false); }}>Use a saved address</button>}
              </div>
            )}

            <section className="checkout-review-section" aria-labelledby="checkout-items-heading">
              <div className="checkout-section-heading"><h2 id="checkout-items-heading">Items in this order</h2><Link to="/cart">Edit bag</Link></div>
              <div className="checkout-review-items">{orderLines.map((line) => (
                <article key={line.key} className="checkout-review-item">
                  <img src={line.image} alt="" />
                  <div><strong>{line.product.name}</strong><span>{line.color}{line.variant?.sku && ` · ${line.variant.sku}`}</span><small>Quantity {line.quantity} × {money(line.price)}</small></div>
                  <b>{money(line.price * line.quantity)}</b>
                </article>
              ))}</div>
            </section>
          </div>

          <div className="checkout-right">
            <div className="checkout-summary">
              <h2>Order summary</h2>
              <div className="checkout-row"><span>{itemCount} units</span><span>{money(subtotal)}</span></div>
              {appliedOffer && <div className="checkout-row checkout-discount"><span>Offer ({appliedOffer.couponCode})</span><span>−{money(discount)}</span></div>}
              <div className="checkout-row"><span>Estimated tax</span><span>{money(tax)}</span></div>
              <div className="checkout-row"><span>Shipping</span><span>{shipping === 0 ? "Free" : money(shipping)}</span></div>
              <div className="checkout-divider" />
              <div className="checkout-row checkout-total-row"><span>Estimated total</span><span>{money(estimatedTotal)}</span></div>
              <div className="checkout-confirmation-card"><span>Deliver to</span><strong>{selectedAddress?.recipientName || "Select an address"}</strong>{selectedAddress && <p>{selectedAddress.addressLine1}{selectedAddress.addressLine2 && `, ${selectedAddress.addressLine2}`}<br />{selectedAddress.city}, {selectedAddress.state} {selectedAddress.pincode}<br />{selectedAddress.country}{selectedAddress.phoneNumber && ` · ${selectedAddress.phoneNumber}`}</p>}</div>
              <div className="checkout-confirmation-card"><span>Estimated delivery</span><strong>{deliveryStart}–{deliveryEnd}</strong><p>Standard delivery, subject to fulfilment and courier availability.</p></div>
              <p className="checkout-note">The server recalculates current prices, stock, tax and offers. If the final amount differs from {money(estimatedTotal)}, no order or payment will be created.</p>
              {cartSyncing && <p className="checkout-note">Updating your bag before checkout…</p>}
              {error && <p className="checkout-error" role="alert">{error}</p>}
              <label className="checkout-confirm"><input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} /> <span>I reviewed the items, variants, quantities, delivery address and final amount.</span></label>
              <button type="submit" className="checkout-pay-btn" disabled={!canSubmit}>
                {submitting ? "Securing your order…" : pendingOrderId ? "Retry payment confirmation" : `Place order · ${money(estimatedTotal)}`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
};

export default PlaceOrder;
