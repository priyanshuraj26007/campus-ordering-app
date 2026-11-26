import { redirect } from "next/navigation";
import { currentEmail } from "@/lib/auth";
import { getMenu, listOrders, shopIsOpen } from "@/lib/orders";
import { ACTIVE } from "@/lib/types";
import MenuApp from "@/components/MenuApp";
export default async function Home() {
  const email = await currentEmail();
  if (!email) redirect("/login");
  const [orders, menu, open] = await Promise.all([listOrders(email), getMenu(), shopIsOpen()]);
  const active = orders.find((o) => ACTIVE.includes(o.status));
  return <MenuApp menu={menu} open={open} activeId={active?.id ?? null} email={email} />;
}
