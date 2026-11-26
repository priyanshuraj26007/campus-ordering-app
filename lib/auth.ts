import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const DOMAIN = "nsut.ac.in";
const WEEK = 60 * 60 * 24 * 7;

// Students sign in with Google (lib/google.ts); this file keeps the session that follows.

export function sessionSecret() {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is required");
  return "local-development-only";
}
const sign = (v: string) => createHmac("sha256", sessionSecret()).update(v).digest("base64url");

export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]*@[a-z0-9.-]+$/.test(email)) return null;
  const [local, domain] = email.split("@");
  // Undergraduates only, for example first.last.ug23@nsut.ac.in
  return domain === DOMAIN && /^[a-z0-9]+([._-][a-z0-9]+)*\.ug\d{2}$/.test(local) ? email : null;
}
export async function startSession(email: string) {
  const body = Buffer.from(JSON.stringify({ email, exp: Date.now() + WEEK * 1000 })).toString("base64url");
  (await cookies()).set("session", `${body}.${sign(body)}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: WEEK });
}
export async function currentEmail(): Promise<string | null> {
  const [body, mac] = ((await cookies()).get("session")?.value ?? "").split(".");
  if (!body || !mac) return null;
  const a = Buffer.from(mac), b = Buffer.from(sign(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const s = JSON.parse(Buffer.from(body, "base64url").toString());
  return s.exp > Date.now() ? normalizeEmail(s.email) : null;
}
