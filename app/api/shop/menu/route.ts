import { readBody, shopRoute } from "@/lib/shoproute";
import { updateMenu } from "@/lib/shop";
export const POST = (req: Request) => shopRoute(async () => updateMenu(await readBody(req)));
