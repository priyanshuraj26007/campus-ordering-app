import { redirect } from "next/navigation";
import { getMenu } from "@/lib/orders";
import { shopBoard } from "@/lib/shop";
import { isShop } from "@/lib/shopauth";
import ShopDashboard from "@/components/ShopDashboard";
export default async function Page() {
  if (!(await isShop())) redirect("/shop/login");
  return <ShopDashboard initial={shopBoard()} menu={getMenu()} />;
}
