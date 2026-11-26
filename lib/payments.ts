import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { db, type Q } from "./db";
import { expireOld, markRefunds, OrderError, shopIsOpen } from "./orders";

type Payment = { order_id: string; provider: "razorpay" | "mock"; gateway_order_id: string; payment_id: string | null; amount_paise: number; status: string };
type RzpPayment = { id: string; order_id: string; amount: number; currency: string; status: string; refund_status?: string | null };
// Payments are created for manual capture so the app decides when money is taken: straight away for a
// live order, never for one that was cancelled or expired. Anything left uncaptured, Razorpay returns
// after this many minutes. Razorpay's minimum is 12.
const CAPTURE_MINUTES = 15;

export function provider(): "razorpay" | "mock" {
  const id = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  if (id && secret) {
    // Real money stays off until capture and refunds exist on the shop side.
    if (!id.startsWith("rzp_test_")) throw new Error("Only Razorpay test keys are allowed for now");
    return "razorpay";
  }
  if (id || secret) throw new Error("Set both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET");
  if (process.env.NODE_ENV === "development") return "mock";
  throw new Error("Razorpay keys are missing");
}

async function rzp<T>(path: string, body?: object, headers?: Record<string, string>): Promise<T> {
  const base = process.env.NODE_ENV === "development" && process.env.RAZORPAY_API_BASE || "https://api.razorpay.com/v1";
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  let r: Response;
  try {
    r = await fetch(base + path, { method: body ? "POST" : "GET", cache: "no-store", signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", ...headers }, body: body && JSON.stringify(body) });
  } catch { throw new OrderError("Couldn't reach Razorpay. Try again."); }
  if (!r.ok) { console.error("Razorpay", path, r.status); throw new OrderError("Razorpay couldn't process that. Try again."); }
  return r.json();
}

// UPI only. Test accounts without UPI also get cards and netbanking so payments can be tested.
async function needsTestFallback(): Promise<boolean> {
  try {
    const r = await fetch("https://api.razorpay.com/v1/methods", { cache: "no-store", signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Basic ${Buffer.from(process.env.RAZORPAY_KEY_ID + ":").toString("base64")}` } });
    return r.ok && (await r.json()).upi === false;
  } catch { return false; }
}

const find = async (orderId: string, q: Q = db()) => (await q<Payment[]>`select * from payments where order_id = ${orderId}`)[0];
async function ownOrder(email: string, id: string) {
  const [o] = await db()<{ id: string; status: string; total: number }[]>`select id, status, total from orders where id = ${id} and email = ${email}`;
  if (!o) throw new OrderError("Order not found.");
  return o;
}

/** Records money that arrived and returns its order ID, or null if it doesn't belong to one.
 *  Safe to call repeatedly: checkout, webhook and reconciliation all end here. */
async function recordPaid(p: RzpPayment): Promise<string | null> {
  return db().begin(async (tx) => {
    await expireOld(tx);
    // Lock the payment row so the checkout reply and the webhook can't both place the order.
    const [row] = await tx<Payment[]>`select * from payments where gateway_order_id = ${p.order_id} for update`;
    if (!row || p.amount !== row.amount_paise || p.currency !== "INR" || !["authorized", "captured"].includes(p.status)) return null;
    if (row.payment_id && row.payment_id !== p.id) { console.error("Second payment for order", row.order_id, "will not be captured"); return null; }
    if (row.status !== "created") {
      if (p.status === "captured" && row.status === "authorized") await tx`update payments set status = 'captured' where order_id = ${row.order_id}`;
      return row.order_id;
    }
    const placed = (await tx`update orders set status = 'placed', placed_at = ${new Date().toISOString()}
      where id = ${row.order_id} and status = 'awaiting_payment'`).count === 1;
    await tx`update payments set payment_id = ${p.id}, status = ${placed ? p.status : "refund_due"} where order_id = ${row.order_id}`;
    return row.order_id;
  });
}

/** Takes the money for a paid order straight away. If Razorpay can't be reached, the next sync tries again. */
async function settle(orderId: string | null) {
  if (!orderId || (await find(orderId))?.status !== "authorized") return;
  try {
    if (await capturePayment(orderId)) return;
    // The money went back to the student before it could be taken, so the order can't go ahead.
    await db().begin(async (tx) => {
      await tx`update orders set status = 'rejected', reason = ${"Your payment didn't go through"}, done_at = ${new Date().toISOString()}
        where id = ${orderId} and status in ('placed', 'ready')`;
      await markRefunds(tx);
    });
  } catch (e) { console.error("Capture will be retried for", orderId, e); }
}

export async function beginPayment(email: string, id: string) {
  await expireOld();
  const o = await ownOrder(email, id);
  if (o.status === "placed") return { paid: true as const };
  if (o.status !== "awaiting_payment") throw new OrderError("This order can no longer be paid for.");
  const kind = provider();
  let p = await find(id);
  if (p && p.provider !== kind) throw new OrderError("Payment settings changed. Cancel this order and place it again.");
  if (p?.provider === "razorpay") {
    // If the earlier result never reached us, find it instead of charging twice.
    const { items } = await rzp<{ items: RzpPayment[] }>(`/orders/${p.gateway_order_id}/payments`);
    const done = items.find((x) => ["authorized", "captured"].includes(x.status));
    const placed = done && await recordPaid(done);
    if (placed) { await settle(placed); return { paid: true as const }; }
  }
  if (!(await shopIsOpen())) throw new OrderError("Safal isn't taking orders right now.");
  if (!p) {
    const amount = o.total * 100;
    const gid = kind === "mock" ? `mock_${randomUUID()}` : (await rzp<{ id: string }>("/orders", { amount, currency: "INR", receipt: id,
      payment: { capture: "manual", capture_options: { manual_expiry_period: CAPTURE_MINUTES, refund_speed: "normal" } } })).id;
    // If two taps race, both end up using whichever row was saved first.
    await db()`insert into payments (order_id, provider, gateway_order_id, amount_paise) values (${id}, ${kind}, ${gid}, ${amount}) on conflict (order_id) do nothing`;
    p = (await find(id))!;
  }
  return { paid: false as const, provider: kind, testFallback: kind === "razorpay" && process.env.RAZORPAY_KEY_ID!.startsWith("rzp_test_") && await needsTestFallback(), key: kind === "razorpay" ? process.env.RAZORPAY_KEY_ID : null, gatewayOrderId: p.gateway_order_id, amount: p.amount_paise };
}

function hmacMatches(secret: string, message: string, given: unknown) {
  if (typeof given !== "string") return false;
  const a = Buffer.from(createHmac("sha256", secret).update(message).digest("hex")), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function verifyCheckout(email: string, id: string, body: { paymentId?: unknown; signature?: unknown } | null) {
  await ownOrder(email, id);
  const p = await find(id);
  if (!p || p.provider !== "razorpay" || provider() !== "razorpay" || typeof body?.paymentId !== "string" || !/^pay_\w+$/.test(body.paymentId))
    throw new OrderError("That payment couldn't be verified.");
  // The gateway order ID comes from our database, so a signature from another order won't match.
  if (!hmacMatches(process.env.RAZORPAY_KEY_SECRET!, `${p.gateway_order_id}|${body.paymentId}`, body.signature)) throw new OrderError("That payment couldn't be verified.");
  const paid = await rzp<RzpPayment>(`/payments/${body.paymentId}`);
  const placed = paid.order_id === p.gateway_order_id && await recordPaid(paid);
  if (!placed) throw new OrderError("That payment couldn't be verified.");
  await settle(placed);
}

export async function handleWebhook(raw: string, signature: string | null): Promise<boolean> {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !hmacMatches(secret, raw, signature)) return false;
  const e = JSON.parse(raw);
  const payment = e.payload?.payment?.entity as RzpPayment | undefined;
  if (payment && ["payment.authorized", "payment.captured"].includes(e.event)) await settle(await recordPaid(payment));
  if (e.event === "refund.processed" && e.payload?.refund?.entity?.payment_id)
    await db()`update payments set status = 'refunded' where payment_id = ${e.payload.refund.entity.payment_id} and status = 'refund_due'`;
  return true;
}

export async function mockPay(email: string, id: string) {
  await ownOrder(email, id);
  const p = await find(id);
  if (provider() !== "mock" || p?.provider !== "mock") throw new OrderError("Test payment isn't available.");
  await settle(await recordPaid({ id: `mockpay_${id}`, order_id: p.gateway_order_id, amount: p.amount_paise, currency: "INR", status: "authorized" }));
}

/** Takes the authorised money. Returns false if it is certain the money can no longer be taken; throws if unsure. */
async function capturePayment(orderId: string): Promise<boolean> {
  const p = await find(orderId);
  if (!p) return true;
  const captured = () => db()`update payments set status = 'captured' where order_id = ${orderId} and status = 'authorized'`;
  if (p.provider === "mock") { await captured(); return true; }
  let now = await rzp<RzpPayment>(`/payments/${p.payment_id}`);
  if (now.status === "authorized") {
    try { now = await rzp<RzpPayment>(`/payments/${p.payment_id}/capture`, { amount: p.amount_paise, currency: "INR" }); }
    catch { now = await rzp<RzpPayment>(`/payments/${p.payment_id}`); } // it may have worked even though we got no reply
  }
  if (now.status === "captured" && !now.refund_status) { await captured(); return true; }
  if (now.status === "authorized") throw new Error("Payment is still only authorised");
  return false;
}

// Refunds Razorpay turned down, usually because the account balance is too low. Retried on every run.
// Kept in memory, so on a serverless host each instance only knows about the refunds it tried itself.
const stuck = new Set<string>();
export const stuckRefunds = () => stuck.size;
let syncing = false, lastSync = 0;
/** Moves payments forward without webhooks: takes money that couldn't be captured yet, then pays out refunds.
 *  The idempotency key means a retry can't refund twice. */
export async function syncPayments() {
  if (syncing || Date.now() - lastSync < 20000) return;
  syncing = true; lastSync = Date.now();
  const done = (orderId: string) => db()`update payments set status = 'refunded' where order_id = ${orderId} and status = 'refund_due'`;
  try {
    for (const { order_id } of await db()<{ order_id: string }[]>`select order_id from payments where status = 'authorized' limit 20`)
      await settle(order_id);
    for (const p of await db()<Payment[]>`select * from payments where status = 'refund_due' and payment_id is not null limit 20`) {
      if (p.provider === "mock") { await done(p.order_id); continue; }
      try {
        const now = await rzp<RzpPayment>(`/payments/${p.payment_id}`);
        if (now.status === "refunded" || now.refund_status === "full") { await done(p.order_id); stuck.delete(p.order_id); }
        else if (now.status === "captured") {
          stuck.add(p.order_id);
          await rzp(`/payments/${p.payment_id}/refund`, { amount: p.amount_paise, speed: "normal" }, { "X-Refund-Idempotency": `refund-${p.order_id}` });
          await done(p.order_id);
          stuck.delete(p.order_id);
        } // still authorised: Razorpay returns it when the capture window closes
      } catch { /* try again on the next run */ }
    }
  } finally { syncing = false; }
}
