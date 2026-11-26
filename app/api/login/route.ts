import { devLoginEnabled, normalizeEmail, startSession } from "@/lib/auth";
export async function POST(req: Request) {
  if (!devLoginEnabled()) return Response.json({ error: "Not available." }, { status: 404 });
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  if (!email) return Response.json({ error: "Use your NSUT undergraduate email, like first.last.ug23@nsut.ac.in." }, { status: 403 });
  await startSession(email);
  return Response.json({ ok: true });
}
