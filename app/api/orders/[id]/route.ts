import { currentEmail } from "@/lib/auth";
import { cancelOrder, getOrder } from "@/lib/orders";
import { syncPayments } from "@/lib/payments";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_: Request, { params }: Ctx) {
  const email = await currentEmail();
  if (!email) return Response.json({ error: "Please sign in again." }, { status: 401 });
  void syncPayments();
  const order = getOrder(email, (await params).id);
  return order ? Response.json(order) : Response.json({ error: "Order not found." }, { status: 404 });
}
export async function DELETE(_: Request, { params }: Ctx) {
  const email = await currentEmail();
  if (!email) return Response.json({ error: "Please sign in again." }, { status: 401 });
  return cancelOrder(email, (await params).id) ? Response.json({ ok: true })
    : Response.json({ error: "This order can no longer be cancelled." }, { status: 409 });
}
