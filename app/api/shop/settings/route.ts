import { readBody, shopRoute } from "@/lib/shoproute";
import { setOpen } from "@/lib/shop";
export const POST = (req: Request) => shopRoute(async () => setOpen((await readBody(req))?.open));
