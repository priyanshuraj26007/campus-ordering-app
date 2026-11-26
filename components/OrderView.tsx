"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import FoodArt from "./FoodArt";
import { LABEL } from "@/lib/labels";
import { ACTIVE, type Order, type Status } from "@/lib/types";
type Rzp = new (o: object) => { open(): void };
const razorpay = () => (window as unknown as { Razorpay?: Rzp }).Razorpay;
const loadCheckout = () => razorpay() ? Promise.resolve() : new Promise<void>((ok, fail) => {
  const s = document.createElement("script");
  s.src = "https://checkout.razorpay.com/v1/checkout.js";
  s.onload = () => ok(); s.onerror = () => { s.remove(); fail(new Error()); };
  document.body.append(s);
});
const post = async (url: string, body?: object) => {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  return { ok: r.ok, data: await r.json() };
};
const STEPS: Status[] = ["placed", "ready", "collected"];
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeStyle: "short", timeZone: "Asia/Kolkata" });
export default function OrderView({ initial }: { initial: Order }) {
  const [o, setO] = useState(initial), [error, setError] = useState("");
  const active = ACTIVE.includes(o.status), step = STEPS.indexOf(o.status);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(async () => {
      try { const r = await fetch(`/api/orders/${initial.id}`); if (r.ok) setO(await r.json()); } catch { /* retry next time */ }
    }, 5000);
    return () => clearInterval(t);
  }, [active, initial.id]);
  const [busy, setBusy] = useState(false), [mock, setMock] = useState(false), started = useRef(false);
  const id = initial.id;
  const refresh = useCallback(async () => {
    const r = await fetch(`/api/orders/${id}`);
    if (r.ok) setO(await r.json());
  }, [id]);
  const pay = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const { ok, data } = await post(`/api/orders/${id}/pay`);
      if (!ok) { setError(data.error); await refresh(); }
      else if (data.paid) await refresh();
      else if (data.provider === "mock") setMock(true);
      else {
        await loadCheckout();
        new (razorpay()!)({ key: data.key, order_id: data.gatewayOrderId, amount: data.amount, currency: "INR",
          name: "Campus Order", description: "Safal order", theme: { color: "#0b4a32" },
          method: { upi: true, card: data.testFallback, netbanking: data.testFallback, wallet: false, emi: false, paylater: false },
          modal: { ondismiss: () => setBusy(false) },
          handler: async (r: { razorpay_payment_id: string; razorpay_signature: string }) => {
            try {
              const v = await post(`/api/orders/${id}/verify`, { paymentId: r.razorpay_payment_id, signature: r.razorpay_signature });
              if (!v.ok) setError(`${v.data.error} Don't pay again yet. Tap Pay to check it.`);
              await refresh();
            } catch { setError("We couldn't confirm your payment yet. Tap Pay to check it; you won't be charged twice."); }
            setBusy(false);
          } }).open();
        return;
      }
    } catch { setError("Couldn't open the payment. Try again."); }
    setBusy(false);
  }, [id, refresh]);
  async function mockPay() {
    setBusy(true);
    try { const r = await post(`/api/orders/${id}/mock-pay`); if (!r.ok) setError(r.data.error); setMock(false); await refresh(); }
    catch { setError("Couldn't connect. Try again."); }
    setBusy(false);
  }
  useEffect(() => {
    if (started.current || initial.status !== "awaiting_payment" || !location.search.includes("pay=1")) return;
    started.current = true;
    history.replaceState(null, "", location.pathname);
    pay();
  }, [initial.status, pay]);
  const waiting = o.status === "awaiting_payment";
  const paid = o.pay_status === "authorized" || o.pay_status === "captured";
  async function cancel() {
    if (!confirm("Cancel this order?")) return;
    setError("");
    try {
      const r = await fetch(`/api/orders/${o.id}`, { method: "DELETE" });
      if (r.ok) await refresh(); else setError((await r.json()).error);
    } catch { setError("Couldn't connect. Try again."); }
  }
  // Tell the student when it turns ready, even if they're looking at another tab.
  const was = useRef(initial.status);
  useEffect(() => {
    document.title = o.status === "ready" ? "Ready to collect" : "Campus Order";
    if (o.status === "ready" && was.current !== "ready") navigator.vibrate?.([200, 100, 200]);
    was.current = o.status;
  }, [o.status]);
  const MESSAGE: Partial<Record<Status, string>> = {
    awaiting_payment: "Safal gets your order once you pay. Unpaid orders expire after 10 minutes. Orders that aren't collected aren't refunded.",
    placed: o.pickup_at ? `Safal has your order and will have it ready around ${clock(o.pickup_at)}.` : "Safal has your order and is getting it ready.",
    rejected: o.reason ?? "Safal couldn't make this order.", expired: o.reason ?? "This order wasn't paid for in time.",
    not_collected: "This order wasn't collected, so it isn't refunded. Speak to Safal if something went wrong.",
    ready: "Show this code at the counter.", collected: "Enjoy your food!",
  };
  return <main className="page"><Link className="back" href="/">← Menu</Link>
    <article className="token" data-status={o.status}>
      <div className="token-top"><span>Safal, NSUT</span><h1 aria-live="polite">{LABEL[o.status]}</h1>
        {MESSAGE[o.status] && <p>{MESSAGE[o.status]}</p>}
        {active && !waiting && <div className="code"><span>Pickup code</span><strong>{o.code}</strong></div>}</div>
      <div className="tear" aria-hidden />
      <div className="token-body">
        {o.pay_status === "refund_due" && <p className="notice">Your payment wasn&apos;t kept. The refund is automatic and can take a few days.</p>}
        {o.pay_status === "refunded" && <p className="notice">Your refund has been issued. Your bank decides when it arrives.</p>}
        {step >= 0 && <ol className="steps">{STEPS.map((s, i) => <li key={s} className={i < step ? "done" : i === step ? "now" : ""} aria-current={i === step ? "step" : undefined}>{s === "placed" ? "Paid" : s === "ready" ? "Ready" : LABEL[s]}</li>)}</ol>}
        <ul className="lines">{o.lines.map((l, i) => <li key={i}><FoodArt name={l.name} /><div><b>{l.name}</b>
          <span className="muted">{l.qty} × ₹{l.price}{l.size !== "Regular" && `, ${l.size}`}</span></div><b>₹{l.price * l.qty}</b></li>)}</ul>
        {o.note && <p className="muted">Note: {o.note}</p>}
        {o.pickup_at && o.status !== "placed" && <p className="muted">Pickup around {clock(o.pickup_at)}</p>}
        <p className="total"><span>{paid ? "Paid" : o.pay_status ? "Total" : waiting ? "To pay" : "Pay at counter"}</span><b>₹{o.total}</b></p>
        {error && <p className="error" role="alert">{error}</p>}
        {waiting && !mock && <button className="primary" disabled={busy} onClick={pay}>{busy ? "Opening payment…" : `Pay ₹${o.total}`}</button>}
        {waiting && mock && <div className="mock"><b>Simulated payment</b><p className="muted">No Razorpay keys are set, so no money moves.</p>
          <button className="primary" disabled={busy} onClick={mockPay}>Simulate success</button>
          <button className="plain" disabled={busy} onClick={() => { setMock(false); setError("Payment didn't go through. You can try again."); }}>Simulate failure</button></div>}
        {waiting && <button className="plain danger" onClick={cancel}>Cancel order</button>}
      </div>
    </article>
    <Link className="center" href="/orders">All my orders</Link></main>;
}
