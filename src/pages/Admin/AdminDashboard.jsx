import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { createCoupon, deactivateCoupon, getCoupons } from "../../services/api";
import AdminProducts from "./AdminProducts";
import AdminOrders from "./AdminOrders";
import AdminInventory from "./AdminInventory";
import AdminCustomers from "./AdminCustomers";
import "./AdminDashboard.css";

const toLocalInput = (date) => {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const initialOffer = () => {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 30);
  return {
    couponCode: "", description: "", discountType: "PERCENTAGE",
    discountValue: "", minimumOrderAmount: "0", maximumDiscountAmount: "",
    usageLimit: "", usageLimitPerUser: "1",
    validFrom: toLocalInput(now), validTo: toLocalInput(end),
  };
};

const offerState = (coupon) => {
  const now = Date.now();
  if (!coupon.isActive) return "Inactive";
  if (new Date(coupon.validFrom).getTime() > now) return "Scheduled";
  if (new Date(coupon.validTo).getTime() < now) return "Expired";
  return "Active";
};

const AdminDashboard = () => {
  const { user, accessToken, signOut } = useAuth();
  const [section, setSection] = useState("overview");
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [offer, setOffer] = useState(initialOffer);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadOffers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const page = await getCoupons(accessToken);
      setCoupons(page.content || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { loadOffers(); }, [loadOffers]);

  const activeCount = useMemo(() => coupons.filter((coupon) => offerState(coupon) === "Active").length, [coupons]);

  const updateOffer = (field, value) => setOffer((current) => ({ ...current, [field]: value }));

  const submitOffer = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (new Date(offer.validTo) <= new Date(offer.validFrom)) {
      setError("The end date must be later than the start date.");
      return;
    }
    if (offer.discountType === "PERCENTAGE" && Number(offer.discountValue) > 100) {
      setError("A percentage discount cannot be greater than 100%.");
      return;
    }
    const payload = {
      ...offer,
      couponCode: offer.couponCode.trim().toUpperCase(),
      discountValue: Number(offer.discountValue),
      minimumOrderAmount: Number(offer.minimumOrderAmount || 0),
      maximumDiscountAmount: offer.maximumDiscountAmount ? Number(offer.maximumDiscountAmount) : null,
      usageLimit: offer.usageLimit ? Number(offer.usageLimit) : null,
      usageLimitPerUser: offer.usageLimitPerUser ? Number(offer.usageLimitPerUser) : null,
      validFrom: offer.validFrom,
      validTo: offer.validTo,
    };
    setSaving(true);
    try {
      const created = await createCoupon(accessToken, payload);
      setCoupons((current) => [created, ...current]);
      setOffer(initialOffer());
      setShowForm(false);
      setNotice(`${created.couponCode} is ready to use.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (coupon) => {
    if (!window.confirm(`Deactivate ${coupon.couponCode}? Customers will no longer be able to use it.`)) return;
    setError("");
    try {
      await deactivateCoupon(accessToken, coupon.couponId);
      setCoupons((current) => current.map((item) => item.couponId === coupon.couponId ? { ...item, isActive: false } : item));
      setNotice(`${coupon.couponCode} has been deactivated.`);
    } catch (err) {
      setError(err.message);
    }
  };

  const goToOffers = () => { setSection("offers"); setNotice(""); setError(""); };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-wordmark">SHADES <span>WORLD</span></div>
        <nav aria-label="Admin navigation">
          <button className={section === "overview" ? "active" : ""} onClick={() => setSection("overview")}>Overview</button>
          <button className={section === "offers" ? "active" : ""} onClick={goToOffers}>Offers</button>
          <button className={section === "products" ? "active" : ""} onClick={() => { setSection("products"); setError(""); setNotice(""); }}>Products</button><button className={section === "orders" ? "active" : ""} onClick={() => { setSection("orders"); setError(""); setNotice(""); }}>Orders</button><button className={section === "inventory" ? "active" : ""} onClick={() => setSection("inventory")}>Inventory</button><button className={section === "customers" ? "active" : ""} onClick={() => setSection("customers")}>Customers</button>
        </nav>
        <button className="admin-signout" onClick={signOut}>Sign out</button>
      </aside>

      <main className="admin-main">
        <header className="admin-header"><div><span>Store administration</span><h1>{section === "offers" ? "Offers & coupons" : section === "products" ? "Product catalog" : section === "orders" ? "Order operations" : section === "inventory" ? "Stock operations" : section === "customers" ? "Customer management" : `Good day, ${user?.name?.split(" ")[0]}.`}</h1></div><div className="admin-avatar">{user?.name?.charAt(0)?.toUpperCase()}</div></header>
        {error && <div className="admin-alert error" role="alert">{error}</div>}
        {notice && <div className="admin-alert success" role="status">{notice}</div>}

        {section === "overview" ? <>
          <section className="admin-hero"><div><span>Offers workspace</span><h2>Turn a good collection into an irresistible one.</h2><p>Create seasonal offers, coupon campaigns and product promotions from one place.</p></div><button onClick={() => { goToOffers(); setShowForm(true); }}>+ Create offer</button></section>
          <section className="admin-stats">
            <article><span>Active offers</span><strong>{loading ? "—" : activeCount}</strong><p>Available to customers now</p></article>
            <article><span>Total campaigns</span><strong>{loading ? "—" : coupons.length}</strong><p>Active, scheduled and archived</p></article>
            <article><span>Scheduled</span><strong>{loading ? "—" : coupons.filter((c) => offerState(c) === "Scheduled").length}</strong><p>Launching in the future</p></article>
          </section>
          <section className="admin-empty"><div className="admin-empty-icon">%</div><div><h3>Manage customer offers</h3><p>Create discount codes, set spending thresholds and control usage limits.</p></div><button onClick={goToOffers}>View offers</button></section>
        </> : section === "offers" ? <>
          <div className="offers-toolbar"><div><p>Create and control the codes customers use at checkout.</p></div><button onClick={() => { setShowForm((value) => !value); setError(""); }}>{showForm ? "Close form" : "+ New offer"}</button></div>

          {showForm && <form className="offer-form" onSubmit={submitOffer}>
            <div className="offer-form-heading"><div><span>New campaign</span><h2>Create an offer</h2></div><p>Fields marked * are required.</p></div>
            <div className="offer-form-grid">
              <label>Coupon code *<input value={offer.couponCode} onChange={(e) => updateOffer("couponCode", e.target.value)} placeholder="SUMMER25" maxLength="50" required /></label>
              <label>Description<input value={offer.description} onChange={(e) => updateOffer("description", e.target.value)} placeholder="Summer collection promotion" maxLength="255" /></label>
              <label>Discount type *<select value={offer.discountType} onChange={(e) => updateOffer("discountType", e.target.value)}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed amount</option></select></label>
              <label>{offer.discountType === "PERCENTAGE" ? "Discount percent *" : "Discount amount (₹) *"}<input type="number" min="0.01" step="0.01" value={offer.discountValue} onChange={(e) => updateOffer("discountValue", e.target.value)} required /></label>
              <label>Minimum order (₹)<input type="number" min="0" step="0.01" value={offer.minimumOrderAmount} onChange={(e) => updateOffer("minimumOrderAmount", e.target.value)} /></label>
              <label>Maximum discount (₹)<input type="number" min="0" step="0.01" value={offer.maximumDiscountAmount} onChange={(e) => updateOffer("maximumDiscountAmount", e.target.value)} placeholder="No cap" /></label>
              <label>Starts *<input type="datetime-local" value={offer.validFrom} onChange={(e) => updateOffer("validFrom", e.target.value)} required /></label>
              <label>Ends *<input type="datetime-local" value={offer.validTo} onChange={(e) => updateOffer("validTo", e.target.value)} required /></label>
              <label>Total usage limit<input type="number" min="1" value={offer.usageLimit} onChange={(e) => updateOffer("usageLimit", e.target.value)} placeholder="Unlimited" /></label>
              <label>Uses per customer<input type="number" min="1" value={offer.usageLimitPerUser} onChange={(e) => updateOffer("usageLimitPerUser", e.target.value)} placeholder="Unlimited" /></label>
            </div>
            <div className="offer-form-actions"><button type="button" onClick={() => { setShowForm(false); setOffer(initialOffer()); }}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Creating..." : "Publish offer"}</button></div>
          </form>}

          <section className="offers-list">
            {loading ? <div className="offers-message">Loading offers...</div> : coupons.length === 0 ? <div className="offers-message"><strong>No offers yet</strong><span>Create your first coupon campaign to get started.</span></div> : coupons.map((coupon) => {
              const state = offerState(coupon);
              return <article className="offer-row" key={coupon.couponId}>
                <div className="offer-code"><span>{coupon.couponCode}</span><small>{coupon.description || "No description"}</small></div>
                <div><small>Discount</small><strong>{coupon.discountType === "PERCENTAGE" ? `${coupon.discountValue}%` : `₹${coupon.discountValue}`}</strong></div>
                <div><small>Minimum spend</small><strong>₹{coupon.minimumOrderAmount || 0}</strong></div>
                <div><small>Valid until</small><strong>{new Date(coupon.validTo).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</strong></div>
                <span className={`offer-status ${state.toLowerCase()}`}>{state}</span>
                <button className="offer-action" disabled={!coupon.isActive} onClick={() => deactivate(coupon)}>{coupon.isActive ? "Deactivate" : "Archived"}</button>
              </article>;
            })}
          </section>
        </> : section === "products" ? <AdminProducts /> : section === "orders" ? <AdminOrders /> : section === "inventory" ? <AdminInventory /> : <AdminCustomers />}
      </main>
    </div>
  );
};

export default AdminDashboard;
