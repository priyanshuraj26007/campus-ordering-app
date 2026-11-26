import { redirect } from "next/navigation";
import { isShop } from "@/lib/shopauth";
import ShopLogin from "@/components/ShopLogin";
export default async function Page() {
  if (await isShop()) redirect("/shop");
  return <main className="page"><h1>Safal dashboard</h1><ShopLogin /></main>;
}
