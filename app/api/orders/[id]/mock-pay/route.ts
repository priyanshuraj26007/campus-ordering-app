import { mockPay } from "@/lib/payments";
import { payRoute } from "@/lib/payroute";
type Ctx = { params: Promise<{ id: string }> };
export const POST = (_: Request, { params }: Ctx) => payRoute(params, mockPay);
