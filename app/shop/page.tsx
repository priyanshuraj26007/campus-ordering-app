import { redirect } from "next/navigation";
import { getMenu } from "@/lib/orders";
import { shopBoard } from "@/lib/shop";
import { isShop } from "@/lib/shopauth";
import ShopDashboard from "@/components/ShopDashboard";
export default async function Page() {
  if (!(await isShop())) redirect("/shop/login");
  const [board, menu] = await Promise.all([shopBoard(), getMenu()]);
  return <ShopDashboard initial={board} menu={menu} />;
}
