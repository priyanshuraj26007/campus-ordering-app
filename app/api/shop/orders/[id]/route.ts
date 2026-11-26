import { readBody, shopRoute } from "@/lib/shoproute";
import { shopAction } from "@/lib/shop";
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  shopRoute(async () => shopAction((await params).id, await readBody(req)));
