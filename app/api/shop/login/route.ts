import { shopSignIn } from "@/lib/shopauth";
export async function POST(req: Request) {
  const r = await shopSignIn((await req.json().catch(() => null))?.passcode);
  if (r === "ok") return Response.json({ ok: true });
  return r === "wait" ? Response.json({ error: "Too many tries. Wait 5 minutes." }, { status: 429 }) : Response.json({ error: "Wrong passcode." }, { status: 403 });
}
