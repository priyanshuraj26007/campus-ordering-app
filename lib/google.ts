// Google sign-in, limited to NSUT accounts. Standard OpenID Connect with PKCE, no library needed:
// we send people to Google, Google sends back a one-time code, and the server swaps it for an ID token.
import { createHash, randomBytes } from "node:crypto";

export const NSUT_DOMAIN = "nsut.ac.in";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const googleEnabled = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
// The address the browser actually used, so Google returns people to the same host that holds their cookie.
// (In development, req.url says localhost even when the browser is on 127.0.0.1.) APP_URL pins it in production.
// Trusting Host here is safe: Google only redirects to addresses registered in the Google Cloud console.
function appOrigin(req: Request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = req.headers, host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}
export const callbackUrl = (req: Request) => `${appOrigin(req)}/api/auth/google/callback`;

const token = () => randomBytes(32).toString("base64url");

/** Where to send the browser, and the secrets to keep in a short-lived cookie until Google sends it back. */
export function beginSignIn(redirectUri: string) {
  const state = token(), nonce = token(), verifier = token();
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri, response_type: "code",
    scope: "openid email profile", state, nonce, prompt: "select_account",
    hd: NSUT_DOMAIN, // only a hint to Google's account picker; the domain is checked again below
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
  }).toString();
  return { url: url.toString(), cookie: `${state}.${nonce}.${verifier}` };
}

export type IdClaims = { iss?: string; aud?: string; exp?: number; nonce?: string; email?: string; email_verified?: boolean; hd?: string; name?: string };
export type Rejection = "invalid" | "not_nsut";

/** Checks an ID token's claims. The token comes straight from Google's token endpoint over HTTPS,
 *  so per Google's guidance its signature doesn't need re-checking; its contents still do. */
export function checkClaims(c: IdClaims, expect: { clientId: string; nonce: string; now: number }): { email: string } | { error: Rejection } {
  if (c.iss !== "https://accounts.google.com" && c.iss !== "accounts.google.com") return { error: "invalid" };
  if (c.aud !== expect.clientId || !c.nonce || c.nonce !== expect.nonce) return { error: "invalid" };
  if (typeof c.exp !== "number" || c.exp * 1000 < expect.now) return { error: "invalid" };
  // hd is only present for Workspace accounts, so a personal Gmail can't pass by using an NSUT-looking address.
  if (c.hd !== NSUT_DOMAIN || c.email_verified !== true || typeof c.email !== "string") return { error: "not_nsut" };
  return { email: c.email };
}

export function readIdToken(idToken: string): IdClaims {
  const part = idToken.split(".")[1];
  if (!part) throw new Error("Malformed ID token");
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

/** Swaps Google's one-time code for the signed-in account's claims. */
export async function exchangeCode(code: string, verifier: string, redirectUri: string): Promise<IdClaims> {
  const r = await fetch(TOKEN_URL, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(10000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, code_verifier: verifier, redirect_uri: redirectUri, grant_type: "authorization_code",
      client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET! }),
  });
  if (!r.ok) throw new Error(`Google token exchange failed: ${r.status}`);
  const { id_token } = await r.json() as { id_token?: string };
  if (!id_token) throw new Error("Google sent no ID token");
  return readIdToken(id_token);
}
