import { currentEmail } from "@/lib/auth";
import { OrderError, placeOrder } from "@/lib/orders";
export async function POST(req: Request) {
  const email = await currentEmail();
  if (!email) return Response.json({ error: "Please sign in again." }, { status: 401 });
  try {
    return Response.json({ id: await placeOrder(email, await req.json().catch(() => null)) }, { status: 201 });
  } catch (e) {
    if (e instanceof OrderError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
