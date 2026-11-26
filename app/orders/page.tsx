import Link from "next/link";
import { redirect } from "next/navigation";
import { currentEmail } from "@/lib/auth";
import { listOrders } from "@/lib/orders";
import { LABEL } from "@/lib/labels";
import { ACTIVE } from "@/lib/types";
import FoodArt from "@/components/FoodArt";
import { ThemeMenu } from "@/components/ThemeSwitch";
import LiveRefresh from "@/components/LiveRefresh";
export default async function Orders() {
  const email = await currentEmail();
  if (!email) redirect("/login");
  const orders = await listOrders(email);
  return <main className="page"><LiveRefresh live={orders.some((o) => ACTIVE.includes(o.status))} /><div className="page-top"><Link className="back" href="/">← Menu</Link><ThemeMenu /></div><h1>My orders</h1>
    {!orders.length && <p className="muted">No orders yet. Your first one will show up here.</p>}
    <ul className="history">{orders.map((o) => <li key={o.id}><Link className="row" href={`/orders/${o.id}`}><FoodArt name={o.lines[0]?.name ?? ""} /><div><b>{o.lines.map((l) => `${l.qty} × ${l.name}`).join(", ")}</b>
      <span className="muted">{new Date(o.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}, ₹{o.total}</span></div><span className={ACTIVE.includes(o.status) ? "pill live" : "pill"}>{LABEL[o.status]}</span></Link></li>)}</ul></main>;
}
