import { db } from "./db";
import { COLS, expireOld, markRefunds, OrderError, shopIsOpen, todayStart, withLines } from "./orders";
import { stuckRefunds } from "./payments";
import { PICKUP_MINUTES, REASONS, type ShopOrder } from "./types";

const now = () => new Date().toISOString();
const gone = () => new OrderError("This order has already changed. The list is now up to date.");
// The shop sees a name, not an email address.
const nameOf = (email: string) => email.split("@")[0].replace(/\.ug\d+$/, "").split(/[._-]/).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

export function shopBoard() {
  expireOld();
  const today = todayStart();
  const rows = db().prepare(`SELECT ${COLS}, email, placed_at, ready_at FROM orders WHERE shop_id='safal' AND (status IN ('placed','ready')
    OR (status IN ('collected','rejected','not_collected','expired') AND done_at >= ?)) ORDER BY COALESCE(placed_at, created_at)`).all(today) as (Omit<ShopOrder, "lines" | "student"> & { email: string })[];
  // The pickup code stays with the student, so matching it proves who is collecting.
  const orders = rows.map(({ email, code: _code, ...o }) => withLines({ ...o, code: "", student: nameOf(email) })) as ShopOrder[];
  const sold = rows.filter((o) => o.status === "collected" || o.status === "not_collected");
  return { open: shopIsOpen(), orders, sales: sold.reduce((s, o) => s + o.total, 0), count: sold.length, stuck: stuckRefunds() };
}

// Paid orders arrive already accepted. Safal marks them ready, or cancels one it can't make (the student is refunded).
export function shopAction(id: string, body: { action?: unknown; reason?: unknown } | null) {
  const move = (sql: string, ...args: unknown[]) => { if (!db().prepare(sql).run(...args).changes) throw gone(); };
  switch (body?.action) {
    case "ready": return move("UPDATE orders SET status='ready', ready_at=? WHERE id=? AND status='placed'", now(), id);
    case "not_collected": return move("UPDATE orders SET status='not_collected', done_at=? WHERE id=? AND status='ready' AND ready_at < ?", now(), id, new Date(Date.now() - PICKUP_MINUTES * 60000).toISOString());
    case "reject":
      if (!REASONS.includes(body.reason as never)) throw new OrderError("Choose a reason.");
      return db().transaction(() => {
        move("UPDATE orders SET status='rejected', reason=?, done_at=? WHERE id=? AND status IN ('placed','ready')", body.reason, now(), id);
        markRefunds();
      }).immediate();
    default: throw new OrderError("Unknown action.");
  }
}

// A paid order can be handed over even if nobody tapped Ready, so a busy counter never has to.
export function collect(code: unknown): string {
  if (typeof code !== "string" || !/^\d{4}$/.test(code)) throw new OrderError("Enter the 4-digit code.");
  const o = db().prepare("SELECT id, status, email FROM orders WHERE shop_id='safal' AND code=? AND status IN ('awaiting_payment','placed','ready')").get(code) as { id: string; status: string; email: string } | undefined;
  if (!o) throw new OrderError("No order has that code.");
  if (o.status === "awaiting_payment") throw new OrderError(`${nameOf(o.email)} hasn't paid for this order yet.`);
  if (!db().prepare("UPDATE orders SET status='collected', done_at=? WHERE id=? AND status IN ('placed','ready')").run(now(), o.id).changes) throw gone();
  return nameOf(o.email);
}

export function setOpen(open: unknown) {
  if (typeof open !== "boolean") throw new OrderError("Invalid setting.");
  db().prepare("UPDATE shops SET is_open=? WHERE id='safal'").run(open ? 1 : 0);
}
export function updateMenu(b: { itemId?: unknown; available?: unknown; variantId?: unknown; price?: unknown } | null) {
  let changes = 0;
  if (typeof b?.itemId === "string" && typeof b.available === "boolean")
    changes = db().prepare("UPDATE items SET available=? WHERE id=? AND shop_id='safal'").run(b.available ? 1 : 0, b.itemId).changes;
  else if (Number.isInteger(b?.variantId) && Number.isInteger(b?.price) && (b!.price as number) >= 1 && (b!.price as number) <= 2000)
    changes = db().prepare("UPDATE variants SET price=? WHERE id=? AND item_id IN (SELECT id FROM items WHERE shop_id='safal')").run(b!.price, b!.variantId).changes;
  else throw new OrderError("Enter a whole price between ₹1 and ₹2000.");
  if (!changes) throw new OrderError("Item not found.");
}
