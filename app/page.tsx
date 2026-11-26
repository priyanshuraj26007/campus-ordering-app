import { redirect } from "next/navigation";
import { currentEmail } from "@/lib/auth";
import { getMenu, listOrders, shopIsOpen } from "@/lib/orders";
import { ACTIVE } from "@/lib/types";
import MenuApp from "@/components/MenuApp";
import LiveRefresh from "@/components/LiveRefresh";
export default async function Home() {
  const email = await currentEmail();
  if (!email) redirect("/login");
  const [orders, menu, open] = await Promise.all([listOrders(email), getMenu(), shopIsOpen()]);
  const active = orders.filter((o) => ACTIVE.includes(o.status));
  return <><LiveRefresh live={active.length > 0} />
    <MenuApp menu={menu} open={open} active={active.map((o) => o.id)} email={email} /></>;
}
