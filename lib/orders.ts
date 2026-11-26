import { randomInt, randomUUID } from "node:crypto";
import { db } from "./db";
import { ACTIVE, ORDER_LIMIT, PAY_MINUTES, type Category, type Order, type OrderLine } from "./types";

export class OrderError extends Error {}
const ACTIVE_SQL = ACTIVE.map((s) => `'${s}'`).join(",");

const ago = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
/** Money for a dead order is never kept. */
export const markRefunds = () => db().prepare(`UPDATE payments SET status='refund_due' WHERE status IN ('authorized','captured')
  AND order_id IN (SELECT id FROM orders WHERE status IN ('expired','cancelled','rejected'))`).run();

/** Start of today in India, as an ISO timestamp. */
export const todayStart = () => new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })}T00:00:00+05:30`).toISOString();

// Unpaid orders lapse so they can't block the student. Leftovers from an earlier day are closed:
// an order Safal never marked ready is refunded, one that was ready but never collected is not.
export function expireOld() {
  const now = new Date().toISOString(), today = todayStart();
  db().prepare("UPDATE orders SET status='expired' WHERE status='awaiting_payment' AND created_at < ?").run(ago(PAY_MINUTES));
  db().prepare("UPDATE orders SET status='expired', done_at=?, reason='Safal didn''t get to this order' WHERE status='placed' AND COALESCE(placed_at, created_at) < ?").run(now, today);
  db().prepare("UPDATE orders SET status='not_collected', done_at=? WHERE status='ready' AND ready_at < ?").run(now, today);
  markRefunds();
}

export const shopIsOpen = () => !!(db().prepare("SELECT is_open FROM shops WHERE id='safal'").get() as { is_open: number }).is_open;

export function getMenu(): Category[] {
  const rows = db().prepare(`SELECT i.id, i.name, i.portion, i.available, i.category, v.id vid, v.size, v.price
    FROM items i JOIN variants v ON v.item_id = i.id WHERE i.shop_id = 'safal' ORDER BY i.sort, v.id`).all() as
    { id: string; name: string; portion: string | null; available: number; category: string; vid: number; size: string; price: number }[];
  const cats = new Map<string, Category>();
  for (const r of rows) {
    let c = cats.get(r.category);
    if (!c) cats.set(r.category, (c = { name: r.category, items: [] }));
    let item = c.items.find((i) => i.id === r.id);
    if (!item) c.items.push((item = { id: r.id, name: r.name, portion: r.portion, available: !!r.available, variants: [] }));
    item.variants.push({ id: r.vid, size: r.size, price: r.price });
  }
  return [...cats.values()];
}

export function placeOrder(email: string, body: unknown): string {
  const { lines, note = "", pickupIn = 0 } = (body ?? {}) as { lines?: unknown; note?: unknown; pickupIn?: unknown };
  if (!Array.isArray(lines) || !lines.length || lines.length > 30) throw new OrderError("Your cart is empty or too large.");
  if (typeof note !== "string" || note.length > 200) throw new OrderError("Keep the note under 200 characters.");
  if (![0, 15, 30, 45, 60].includes(pickupIn as number)) throw new OrderError("Choose a valid pickup time.");
  const qty = new Map<number, number>();
  for (const l of lines) {
    if (!Number.isInteger(l?.variantId) || !Number.isInteger(l?.qty) || l.qty < 1 || l.qty > 20) throw new OrderError("Something in your cart is invalid.");
    qty.set(l.variantId, (qty.get(l.variantId) ?? 0) + l.qty);
  }
  return db().transaction(() => {
    expireOld();
    if (!shopIsOpen()) throw new OrderError("Safal isn't taking orders right now.");
    if (db().prepare(`SELECT 1 FROM orders WHERE email = ? AND status IN (${ACTIVE_SQL})`).get(email))
      throw new OrderError("You already have an active order. Finish or cancel it first.");
    // Prices always come from the database, never from the browser.
    const find = db().prepare(`SELECT v.id, v.size, v.price, i.name, i.available FROM variants v
      JOIN items i ON i.id = v.item_id WHERE v.id = ? AND i.shop_id = 'safal'`);
    const resolved = [...qty].map(([id, q]) => {
      const v = find.get(id) as { id: number; size: string; price: number; name: string; available: number } | undefined;
      if (!v) throw new OrderError("An item in your cart is no longer on the menu.");
      if (!v.available) throw new OrderError(`${v.name} just sold out. Remove it to continue.`);
      return { ...v, qty: q };
    });
    const total = resolved.reduce((s, l) => s + l.price * l.qty, 0);
    if (total > ORDER_LIMIT) throw new OrderError(`Orders are limited to ₹${ORDER_LIMIT} for now.`);
    const taken = db().prepare(`SELECT 1 FROM orders WHERE shop_id='safal' AND code = ? AND status IN (${ACTIVE_SQL})`);
    let code: string;
    do code = String(randomInt(1000, 10000)); while (taken.get(code));
    const id = randomUUID(), now = Date.now();
    db().prepare("INSERT INTO orders (id, shop_id, email, code, total, note, pickup_at, created_at) VALUES (?, 'safal', ?, ?, ?, ?, ?, ?)")
      .run(id, email, code, total, note.trim(), pickupIn ? new Date(now + (pickupIn as number) * 60000).toISOString() : null, new Date(now).toISOString());
    const add = db().prepare("INSERT INTO order_lines (order_id, variant_id, name, size, price, qty) VALUES (?, ?, ?, ?, ?, ?)");
    for (const l of resolved) add.run(id, l.id, l.name, l.size, l.price, l.qty);
    return id;
  }).immediate();
}

export const COLS = "id, code, orders.status, total, note, pickup_at, created_at, reason, (SELECT p.status FROM payments p WHERE p.order_id = orders.id) pay_status";
export const withLines = <T extends { id: string }>(o: T): T & { lines: OrderLine[] } => ({ ...o,
  lines: db().prepare("SELECT name, size, price, qty FROM order_lines WHERE order_id = ?").all(o.id) as OrderLine[] });

// Every lookup includes the email so students can only reach their own orders.
export function getOrder(email: string, id: string): Order | null {
  expireOld();
  const o = db().prepare(`SELECT ${COLS} FROM orders WHERE id = ? AND email = ?`).get(id, email) as Omit<Order, "lines"> | undefined;
  return o ? withLines(o) : null;
}
export const listOrders = (email: string): Order[] => {
  expireOld();
  return (db().prepare(`SELECT ${COLS} FROM orders WHERE email = ? ORDER BY created_at DESC LIMIT 50`).all(email) as Omit<Order, "lines">[]).map(withLines);
};
// Students can cancel only before paying. Once paid, the order is Safal's to make.
export const cancelOrder = (email: string, id: string) => db().transaction(() => {
  const done = db().prepare("UPDATE orders SET status='cancelled' WHERE id = ? AND email = ? AND status = 'awaiting_payment'").run(id, email).changes === 1;
  if (done) markRefunds(); // in case a payment lands at the same moment
  return done;
}).immediate();
