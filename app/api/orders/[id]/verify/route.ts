import { verifyCheckout } from "@/lib/payments";
import { payRoute } from "@/lib/payroute";
type Ctx = { params: Promise<{ id: string }> };
export const POST = (req: Request, { params }: Ctx) =>
  payRoute(params, async (email, id) => verifyCheckout(email, id, await req.json().catch(() => null)));
