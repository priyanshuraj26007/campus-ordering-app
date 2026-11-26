import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { normalizeEmail, startSession } from "@/lib/auth";
import { callbackUrl, checkClaims, exchangeCode, googleEnabled } from "@/lib/google";

// Relative, so the browser stays on whichever host it came in on.
const back = (_req: Request, path: string) => new Response(null, { status: 302, headers: { Location: path } });
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Step 2: Google sends the student back here with a one-time code.
export async function GET(req: Request) {
  if (!googleEnabled()) return back(req, "/login");
  const jar = await cookies(), saved = jar.get("g_oauth")?.value ?? "";
  jar.delete({ name: "g_oauth", path: "/api/auth/google" }); // each attempt is used once
  const q = new URL(req.url).searchParams, [state, nonce, verifier] = saved.split(".");
  if (q.get("error") === "access_denied") return back(req, "/login"); // they backed out at Google; nothing to report
  const code = q.get("code"), given = q.get("state") ?? "";
  if (!code || !state || !nonce || !verifier || !same(given, state)) return back(req, "/login?error=failed");
  try {
    const result = checkClaims(await exchangeCode(code, verifier, callbackUrl(req)),
      { clientId: process.env.GOOGLE_CLIENT_ID!, nonce, now: Date.now() });
    if ("error" in result) return back(req, `/login?error=${result.error === "not_nsut" ? "not_nsut" : "failed"}`);
    // Same rule as before: NSUT undergraduate accounts only, such as first.last.ug23@nsut.ac.in.
    const email = normalizeEmail(result.email);
    if (!email) return back(req, "/login?error=not_student");
    await startSession(email);
    return back(req, "/");
  } catch (e) {
    console.error("Google sign-in", e);
    return back(req, "/login?error=failed");
  }
}
