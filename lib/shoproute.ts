import { OrderError } from "./orders";
import { isShop } from "./shopauth";
export async function shopRoute(run: () => unknown) {
  if (!(await isShop())) return Response.json({ error: "Please sign in again." }, { status: 401 });
  try { return Response.json((await run()) ?? { ok: true }); }
  catch (e) {
    if (e instanceof OrderError) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
export const readBody = (req: Request) => req.json().catch(() => null);
