import { currentEmail } from "./auth";
import { OrderError } from "./orders";
export async function payRoute(params: Promise<{ id: string }>, run: (email: string, id: string) => unknown) {
  const email = await currentEmail();
  if (!email) return Response.json({ error: "Please sign in again." }, { status: 401 });
  try {
    return Response.json((await run(email, (await params).id)) ?? { ok: true });
  } catch (e) {
    if (e instanceof OrderError) return Response.json({ error: e.message }, { status: 400 });
    console.error(e);
    return Response.json({ error: "Payments aren't available right now." }, { status: 503 });
  }
}
