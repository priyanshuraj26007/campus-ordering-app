import { notFound, redirect } from "next/navigation";
import { currentEmail } from "@/lib/auth";
import { getOrder } from "@/lib/orders";
import OrderView from "@/components/OrderView";
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const email = await currentEmail();
  if (!email) redirect("/login");
  const order = getOrder(email, (await params).id);
  if (!order) notFound();
  return <OrderView initial={order} />;
}
