import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getMyOrders } from "../../services/api";
import "./MyOrders.css";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
const date = (value) => value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—";
const label = (value) => String(value || "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function MyOrders() {
  const { accessToken, user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    let active = true;
    getMyOrders(accessToken).then((page) => { if (active) setOrders(page.content || []); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken]);

  return <main className="my-orders-page"><div className="container">
    <header className="orders-page-header"><div><span>Your account</span><h1>My Orders</h1><p>Welcome back, {user?.name?.split(" ")[0]}. Follow every order from confirmation to delivery.</p></div><Link to="/#shop">Continue shopping</Link></header>
    {error && <div className="orders-error">{error}</div>}
    {loading ? <div className="orders-empty">Loading your orders…</div> : orders.length === 0 ? <div className="orders-empty"><span>SW</span><h2>No orders yet</h2><p>Your Shades World purchases will appear here.</p><Link to="/#shop">Explore the collection</Link></div> : <section className="orders-list">{orders.map((order) => {
      const shipment = order.shipments?.[0]; const open = expanded === order.orderId;
      return <article className="customer-order" key={order.orderId}>
        <header><div><small>Order</small><strong>#{order.orderId}</strong></div><div><small>Placed</small><strong>{date(order.purchasedAt)}</strong></div><div><small>Total</small><strong>{money(order.totalAmount)}</strong></div><span className={`order-state ${order.orderStatus?.toLowerCase()}`}>{label(order.orderStatus)}</span></header>
        <div className="order-progress"><span className={["PLACED","CONFIRMED","PROCESSING","SHIPPED","DELIVERED"].includes(order.orderStatus) ? "done" : ""}>Ordered</span><i/><span className={["PROCESSING","SHIPPED","DELIVERED"].includes(order.orderStatus) ? "done" : ""}>Preparing</span><i/><span className={["SHIPPED","DELIVERED"].includes(order.orderStatus) ? "done" : ""}>Shipped</span><i/><span className={order.orderStatus === "DELIVERED" ? "done" : ""}>Delivered</span></div>
        <div className="order-items">{order.items?.map((item) => <div className="customer-order-item" key={item.orderItemId}><span className="order-item-mark">{item.productName?.charAt(0)}</span><div><strong>{item.productName}</strong><small>{item.sku} · Quantity {item.quantity}</small></div><b>{money(item.lineTotal)}</b></div>)}</div>
        <button className="order-details-toggle" onClick={() => setExpanded(open ? null : order.orderId)}>{open ? "Hide details" : "View order details"}</button>
        {open && <div className="order-extra"><section><h3>Delivery address</h3><p>{order.shippingAddress.name}<br/>{order.shippingAddress.line1}{order.shippingAddress.line2 && `, ${order.shippingAddress.line2}`}<br/>{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.pincode}<br/>{order.shippingAddress.country}</p></section><section><h3>Payment & delivery</h3><p>Payment: {order.payments?.[0] ? label(order.payments[0].status) : "Not recorded"}<br/>Tracking: {shipment?.trackingNumber || "Available after dispatch"}<br/>{shipment?.expectedDeliveryAt ? `Expected by ${date(shipment.expectedDeliveryAt)}` : order.deliveredAt ? `Delivered ${date(order.deliveredAt)}` : "Delivery estimate pending"}</p></section><section><h3>Price summary</h3><p>Subtotal: {money(order.subtotalAmount)}<br/>Discount: −{money(order.discountAmount)}<br/>Shipping: {money(order.shippingAmount)}<br/>Tax: {money(order.taxAmount)}</p><strong>Total: {money(order.totalAmount)}</strong></section></div>}
      </article>;
    })}</section>}
  </div></main>;
}
