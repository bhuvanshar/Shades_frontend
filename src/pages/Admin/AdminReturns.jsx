import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { getAdminReturns, processRefund, updateReturnStatus } from "../../services/api";
import "./AdminReturns.css";

const next = { REQUESTED: ["APPROVED", "REJECTED"], APPROVED: ["PICKED_UP", "CANCELLED"], PICKED_UP: ["RECEIVED"], RECEIVED: ["COMPLETED"] };
const conditions = ["UNOPENED", "OPENED_UNUSED", "USED", "DAMAGED"];
const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

export default function AdminReturns() {
  const { accessToken } = useAuth();
  const [returns, setReturns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [comments, setComments] = useState("");
  const [inspected, setInspected] = useState({});
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const page = await getAdminReturns(accessToken); setReturns(page.content || []); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [accessToken]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => returns, [returns]);
  const sync = (item) => { setReturns((current) => current.map((entry) => entry.returnId === item.returnId ? item : entry)); setSelected(item); };
  const openReturn = (item) => {
    setSelected(item); setComments(item.adminComments || ""); setError("");
    setInspected(Object.fromEntries(item.items.map((entry) => [entry.returnItemId, entry.itemCondition || "UNOPENED"])));
  };
  const move = async (status) => {
    setSaving(true); setError("");
    try {
      const updated = await updateReturnStatus(accessToken, selected.returnId, status, comments, status === "RECEIVED" ? inspected : null);
      sync(updated); setComments(""); setNotice(`Return #${updated.returnId} is now ${status.toLowerCase().replaceAll("_", " ")}.`);
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  const refund = async (event) => {
    event.preventDefault();
    const payment = selected.payments?.find((entry) => ["PAID", "PARTIALLY_REFUNDED"].includes(entry.status));
    if (!payment) return setError("No refundable payment exists for this order.");
    setSaving(true);
    try { await processRefund(accessToken, payment.paymentId, Number(amount), reason, selected.returnId); await load(); setSelected(null); setNotice("Refund recorded successfully."); setAmount(""); setReason(""); }
    catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  return <section className="returns-admin">
    {error && <div className="admin-alert error">{error}</div>}{notice && <div className="admin-alert success">{notice}</div>}
    <div className="returns-title"><div><h2>Returns & refunds</h2><p>Review customer requests, inspect received products and issue accountable refunds.</p></div><button onClick={load}>Refresh</button></div>
    <div className="return-stats"><article><span>Requests</span><strong>{filtered.length}</strong></article><article><span>Awaiting review</span><strong>{filtered.filter((item) => item.returnStatus === "REQUESTED").length}</strong></article><article><span>In transit</span><strong>{filtered.filter((item) => ["APPROVED", "PICKED_UP"].includes(item.returnStatus)).length}</strong></article><article><span>Refunded</span><strong>{money(filtered.flatMap((item) => item.refunds || []).reduce((sum, item) => sum + Number(item.amount), 0))}</strong></article></div>
    <div className="returns-list">{loading ? <p>Loading returns…</p> : filtered.length === 0 ? <p>No return requests yet.</p> : filtered.map((item) => <button key={item.returnId} onClick={() => openReturn(item)}><strong>Return #{item.returnId}</strong><span>Order #{item.orderId}<small>{item.customerName} · {item.customerEmail}</small></span><span>{item.items.reduce((sum, entry) => sum + entry.quantity, 0)} units</span><em className={item.returnStatus.toLowerCase()}>{item.returnStatus.replaceAll("_", " ")}</em><span>Review →</span></button>)}</div>
    {selected && <div className="return-backdrop" onMouseDown={() => setSelected(null)}><aside className="return-drawer" onMouseDown={(event) => event.stopPropagation()}><header><div><span>Return #{selected.returnId} · Order #{selected.orderId}</span><h2>{selected.customerName}</h2><p>{selected.returnReason}</p></div><button onClick={() => setSelected(null)}>×</button></header>
      <section><h3>Returned items</h3>{selected.items.map((item) => <div className="return-item" key={item.returnItemId}><span><b>{item.productName}</b><small>{item.sku} · Customer reported: {item.itemCondition || "Not provided"}</small></span><strong>{item.quantity} × {money(item.unitPrice)}</strong></div>)}</section>
      <section><h3>Customer comments</h3><p>{selected.customerComments || "No additional comments."}</p></section>
      {selected.returnStatus === "PICKED_UP" && <section className="inspection-section"><h3>Inspection required</h3><p>Record the physical condition of every item before receiving it into inventory.</p>{selected.items.map((item) => <label key={item.returnItemId}><span>{item.productName} · {item.sku}</span><select value={inspected[item.returnItemId] || ""} onChange={(event) => setInspected((current) => ({ ...current, [item.returnItemId]: event.target.value }))}><option value="">Select inspected condition</option>{conditions.map((condition) => <option key={condition} value={condition}>{condition.replaceAll("_", " ")}</option>)}</select></label>)}</section>}
      {next[selected.returnStatus] && <section><h3>Update request</h3><textarea value={comments} onChange={(event) => setComments(event.target.value)} placeholder="Message visible to customer"/><div className="return-actions">{next[selected.returnStatus].map((status) => <button key={status} disabled={saving || (status === "RECEIVED" && selected.items.some((item) => !inspected[item.returnItemId]))} className={["REJECTED", "CANCELLED"].includes(status) ? "danger" : ""} onClick={() => move(status)}>{status.replaceAll("_", " ")}</button>)}</div></section>}
      {["RECEIVED", "COMPLETED"].includes(selected.returnStatus) && <section><h3>Issue refund</h3>{selected.refunds?.map((item) => <p key={item.refundId}>{money(item.amount)} · {item.status} · {item.reason}</p>)}<form className="refund-form" onSubmit={refund}><input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Refund amount" required/><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Refund reason" required/><button disabled={saving}>Issue refund</button></form></section>}
    </aside></div>}
  </section>;
}
