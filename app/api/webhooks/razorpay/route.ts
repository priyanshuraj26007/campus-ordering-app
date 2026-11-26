import { handleWebhook } from "@/lib/payments";
export async function POST(req: Request) {
  const ok = await handleWebhook(await req.text(), req.headers.get("x-razorpay-signature"));
  return ok ? Response.json({ ok: true }) : Response.json({ error: "Invalid signature" }, { status: 400 });
}
