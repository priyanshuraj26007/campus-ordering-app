import { randomInt, randomUUID } from "node:crypto";
import { db, isUniqueViolation, type Q } from "./db";
import { ACTIVE, MAX_ACTIVE_ORDERS, ORDER_LIMIT, PAY_MINUTES, type Category, type Order, type OrderLine } from "./types";

export class OrderError extends Error {}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
/** Start of today in India, as an ISO timestamp. */
export const todayStart = () => new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })}T00:00:00+05:30`).toISOString();

/** Money for a dead order is never kept. */
export const markRefunds = (q: Q = db()) => q`update payments set status = 'refund_due' where status in ('authorized', 'captured')
  and order_id in (select id from orders where status in ('expired', 'cancelled', 'rejected'))`;

// Unpaid orders lapse so they can't block the student. Leftovers from an earlier day are closed:
// an order Safal never marked ready is refunded, one that was ready but never collected is not.
// One round trip: the expiries and the refunds they cause run as a single statement.
export async function expireOld(q: Q = db()) {
  const now = new Date().toISOString(), today = todayStart();
  await q`
    with unpaid as (update orders set status = 'expired' where status = 'awaiting_payment' and created_at < ${ago(PAY_MINUTES)} returning id),
    missed as (update orders set status = 'expired', done_at = ${now}, reason = ${"Safal didn't get to this order"}
      where status = 'placed' and coalesce(placed_at, created_at) < ${today} returning id),
    uncollected as (update orders set status = 'not_collected', done_at = ${now} where status = 'ready' and ready_at < ${today} returning id)
    update payments set status = 'refund_due' where status in ('authorized', 'captured')
      and order_id in (select id from unpaid union all select id from missed)`;
}

export const shopIsOpen = async (q: Q = db()) => !!(await q<{ is_open: boolean }[]>`select is_open from shops where id = 'safal'`)[0]?.is_open;

export async function getMenu(): Promise<Category[]> {
  const rows = await db()<{ id: string; name: string; portion: string | null; available: boolean; category: string; vid: number; size: string; price: number }[]>`
    select i.id, i.name, i.portion, i.available, i.category, v.id as vid, v.size, v.price
    from items i join variants v on v.item_id = i.id where i.shop_id = 'safal' order by i.sort, v.id`;
  const cats = new Map<string, Category>();
  for (const r of rows) {
    let c = cats.get(r.category);
    if (!c) cats.set(r.category, (c = { name: r.category, items: [] }));
    let item = c.items.find((i) => i.id === r.id);
    if (!item) c.items.push((item = { id: r.id, name: r.name, portion: r.portion, available: r.available, variants: [] }));
    item.variants.push({ id: r.vid, size: r.size, price: r.price });
  }
  return [...cats.values()];
}

export async function placeOrder(email: string, body: unknown): Promise<string> {
  const { lines, note = "", pickupIn = 0 } = (body ?? {}) as { lines?: unknown; note?: unknown; pickupIn?: unknown };
  if (!Array.isArray(lines) || !lines.length || lines.length > 30) throw new OrderError("Your cart is empty or too large.");
  if (typeof note !== "string" || note.length > 200) throw new OrderError("Keep the note under 200 characters.");
  if (![0, 15, 30, 45, 60].includes(pickupIn as number)) throw new OrderError("Choose a valid pickup time.");
  const qty = new Map<number, number>();
  for (const l of lines) {
    if (!Number.isInteger(l?.variantId) || !Number.isInteger(l?.qty) || l.qty < 1 || l.qty > 20) throw new OrderError("Something in your cart is invalid.");
    qty.set(l.variantId, (qty.get(l.variantId) ?? 0) + l.qty);
  }
  try {
    return await db().begin(async (tx) => {
      await expireOld(tx);
      if (!(await shopIsOpen(tx))) throw new OrderError("Safal isn't taking orders right now.");
      // Several orders at once are fine; a cap stops one student flooding Safal's list.
      const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from orders where email = ${email} and status in ${tx(ACTIVE)}`;
      if (n >= MAX_ACTIVE_ORDERS) throw new OrderError(`You have ${n} orders on the go. Collect one before ordering more.`);
      // Prices always come from the database, never from the browser.
      const found = new Map((await tx<{ id: number; size: string; price: number; name: string; available: boolean }[]>`
        select v.id, v.size, v.price, i.name, i.available from variants v join items i on i.id = v.item_id
        where v.id in ${tx([...qty.keys()])} and i.shop_id = 'safal'`).map((v) => [v.id, v]));
      const resolved = [...qty].map(([id, q]) => {
        const v = found.get(id);
        if (!v) throw new OrderError("An item in your cart is no longer on the menu.");
        if (!v.available) throw new OrderError(`${v.name} just sold out. Remove it to continue.`);
        return { ...v, qty: q };
      });
      const total = resolved.reduce((s, l) => s + l.price * l.qty, 0);
      if (total > ORDER_LIMIT) throw new OrderError(`Orders are limited to ₹${ORDER_LIMIT} for now.`);
      const taken = new Set((await tx<{ code: string }[]>`select code from orders where shop_id = 'safal' and status in ${tx(ACTIVE)}`).map((r) => r.code));
      let code: string;
      do code = String(randomInt(1000, 10000)); while (taken.has(code));
      const id = randomUUID(), now = Date.now();
      await tx`insert into orders (id, shop_id, email, code, total, note, pickup_at, created_at) values (${id}, 'safal', ${email}, ${code}, ${total},
        ${note.trim()}, ${pickupIn ? new Date(now + (pickupIn as number) * 60000).toISOString() : null}, ${new Date(now).toISOString()})`;
      await tx`insert into order_lines ${tx(resolved.map((l) => ({ order_id: id, variant_id: l.id, name: l.name, size: l.size, price: l.price, qty: l.qty })))}`;
      return id;
    });
  } catch (e) {
    // Two orders racing for the same pickup code are stopped by the unique index.
    if (isUniqueViolation(e, "unique_active_code")) throw new OrderError("That clashed with another order. Try again.");
    throw e;
  }
}

/** Adds each order's lines with one query for the whole list. */
export async function withLines<T extends { id: string }>(orders: T[], q: Q = db()): Promise<(T & { lines: OrderLine[] })[]> {
  if (!orders.length) return [];
  const rows = await q<(OrderLine & { order_id: string })[]>`select order_id, name, size, price, qty from order_lines where order_id in ${q(orders.map((o) => o.id))}`;
  return orders.map((o) => ({ ...o, lines: rows.filter((r) => r.order_id === o.id).map(({ order_id: _o, ...l }) => l) }));
}

type OrderRow = Omit<Order, "lines">;
// Every lookup includes the email so students can only reach their own orders.
export async function getOrder(email: string, id: string): Promise<Order | null> {
  await expireOld();
  const [o] = await db()<OrderRow[]>`select id, code, orders.status, total, note, pickup_at, created_at, reason,
    (select p.status from payments p where p.order_id = orders.id) as pay_status from orders where id = ${id} and email = ${email}`;
  return o ? (await withLines([o]))[0] : null;
}
export async function listOrders(email: string): Promise<Order[]> {
  await expireOld();
  return withLines(await db()<OrderRow[]>`select id, code, orders.status, total, note, pickup_at, created_at, reason,
    (select p.status from payments p where p.order_id = orders.id) as pay_status from orders where email = ${email} order by created_at desc limit 50`);
}
// Students can cancel only before paying. Once paid, the order is Safal's to make.
export async function cancelOrder(email: string, id: string): Promise<boolean> {
  return db().begin(async (tx) => {
    const done = (await tx`update orders set status = 'cancelled' where id = ${id} and email = ${email} and status = 'awaiting_payment'`).count === 1;
    if (done) await markRefunds(tx); // in case a payment lands at the same moment
    return done;
  });
}
