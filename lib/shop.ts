import { db } from "./db";
import { expireOld, markRefunds, OrderError, shopIsOpen, todayStart, withLines } from "./orders";
import { stuckRefunds } from "./payments";
import { PICKUP_MINUTES, REASONS, type ShopOrder } from "./types";

const now = () => new Date().toISOString();
const gone = () => new OrderError("This order has already changed. The list is now up to date.");
// The shop sees a name, not an email address.
const nameOf = (email: string) => email.split("@")[0].replace(/\.ug\d+$/, "").split(/[._-]/).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

export async function shopBoard() {
  await expireOld();
  const today = todayStart();
  const [rows, open] = await Promise.all([
    db()<(Omit<ShopOrder, "lines" | "student"> & { email: string })[]>`
      select id, code, orders.status, total, note, pickup_at, created_at, reason, email, placed_at, ready_at,
        (select p.status from payments p where p.order_id = orders.id) as pay_status
      from orders where shop_id = 'safal' and (status in ('placed', 'ready')
        or (status in ('collected', 'rejected', 'not_collected', 'expired') and done_at >= ${today}))
      order by coalesce(placed_at, created_at)`,
    shopIsOpen(),
  ]);
  // The pickup code stays with the student, so matching it proves who is collecting.
  const orders = (await withLines(rows.map(({ email, code: _code, ...o }) => ({ ...o, code: "", student: nameOf(email) })))) as ShopOrder[];
  const sold = rows.filter((o) => o.status === "collected" || o.status === "not_collected");
  return { open, orders, sales: sold.reduce((s, o) => s + o.total, 0), count: sold.length, stuck: stuckRefunds() };
}

// Paid orders arrive already accepted. Safal marks them ready, or cancels one it can't make (the student is refunded).
export async function shopAction(id: string, body: { action?: unknown; reason?: unknown } | null) {
  switch (body?.action) {
    case "ready":
      if (!(await db()`update orders set status = 'ready', ready_at = ${now()} where id = ${id} and status = 'placed'`).count) throw gone();
      return;
    case "not_collected":
      if (!(await db()`update orders set status = 'not_collected', done_at = ${now()} where id = ${id} and status = 'ready'
        and ready_at < ${new Date(Date.now() - PICKUP_MINUTES * 60000).toISOString()}`).count) throw gone();
      return;
    case "reject":
      if (!REASONS.includes(body.reason as never)) throw new OrderError("Choose a reason.");
      return db().begin(async (tx) => {
        if (!(await tx`update orders set status = 'rejected', reason = ${body.reason as string}, done_at = ${now()}
          where id = ${id} and status in ('placed', 'ready')`).count) throw gone();
        await markRefunds(tx);
      });
    default: throw new OrderError("Unknown action.");
  }
}

// A paid order can be handed over even if nobody tapped Ready, so a busy counter never has to.
export async function collect(code: unknown): Promise<string> {
  if (typeof code !== "string" || !/^\d{4}$/.test(code)) throw new OrderError("Enter the 4-digit code.");
  const [o] = await db()<{ id: string; status: string; email: string }[]>`select id, status, email from orders
    where shop_id = 'safal' and code = ${code} and status in ('awaiting_payment', 'placed', 'ready')`;
  if (!o) throw new OrderError("No order has that code.");
  if (o.status === "awaiting_payment") throw new OrderError(`${nameOf(o.email)} hasn't paid for this order yet.`);
  if (!(await db()`update orders set status = 'collected', done_at = ${now()} where id = ${o.id} and status in ('placed', 'ready')`).count) throw gone();
  return nameOf(o.email);
}

export async function setOpen(open: unknown) {
  if (typeof open !== "boolean") throw new OrderError("Invalid setting.");
  await db()`update shops set is_open = ${open} where id = 'safal'`;
}
export async function updateMenu(b: { itemId?: unknown; available?: unknown; variantId?: unknown; price?: unknown } | null) {
  let changes = 0;
  if (typeof b?.itemId === "string" && typeof b.available === "boolean")
    changes = (await db()`update items set available = ${b.available} where id = ${b.itemId} and shop_id = 'safal'`).count ?? 0;
  else if (Number.isInteger(b?.variantId) && Number.isInteger(b?.price) && (b!.price as number) >= 1 && (b!.price as number) <= 2000)
    changes = (await db()`update variants set price = ${b!.price as number} where id = ${b!.variantId as number}
      and item_id in (select id from items where shop_id = 'safal')`).count ?? 0;
  else throw new OrderError("Enter a whole price between ₹1 and ₹2000.");
  if (!changes) throw new OrderError("Item not found.");
}
