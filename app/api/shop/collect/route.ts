import { readBody, shopRoute } from "@/lib/shoproute";
import { collect } from "@/lib/shop";
export const POST = (req: Request) => shopRoute(async () => ({ student: await collect((await readBody(req))?.code) }));
