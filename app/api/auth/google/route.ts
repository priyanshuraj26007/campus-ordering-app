import { cookies } from "next/headers";
import { beginSignIn, callbackUrl, googleEnabled } from "@/lib/google";

// Step 1: send the student to Google. The state, nonce and PKCE verifier wait in a 10-minute cookie.
export async function GET(req: Request) {
  if (!googleEnabled()) return Response.json({ error: "Google sign-in isn't set up." }, { status: 404 });
  const { url, cookie } = beginSignIn(callbackUrl(req));
  (await cookies()).set("g_oauth", cookie, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth/google", maxAge: 600 });
  return new Response(null, { status: 302, headers: { Location: url } });
}
