import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { sessionSecret } from "./auth";
import { db } from "./db";

const HOURS = 14;
// Wrong tries are counted in memory, so on a serverless host each instance keeps its own count.
let fails: number[] = [];
const stored = async () => (await db()<{ salt: string; hash: string }[]>`select salt, hash from shop_login where shop_id = 'safal'`)[0];
// The passcode hash is part of the signature, so changing the passcode signs every device out.
const sign = (exp: string, hash: string) => createHmac("sha256", sessionSecret()).update(`shop|safal|${exp}|${hash}`).digest("base64url");
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export async function shopSignIn(passcode: unknown): Promise<"ok" | "wrong" | "wait"> {
  fails = fails.filter((t) => t > Date.now() - 5 * 60000);
  if (fails.length >= 8) return "wait";
  const s = await stored();
  if (!s || typeof passcode !== "string" || passcode.length > 100 || !same(scryptSync(passcode, s.salt, 32).toString("hex"), s.hash)) { fails.push(Date.now()); return "wrong"; }
  fails = [];
  const exp = String(Date.now() + HOURS * 3600000);
  (await cookies()).set("shop_session", `${exp}.${sign(exp, s.hash)}`, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: HOURS * 3600 });
  return "ok";
}
export async function isShop(): Promise<boolean> {
  const [exp, mac] = ((await cookies()).get("shop_session")?.value ?? "").split(".");
  if (!exp || !mac) return false;
  const s = await stored();
  return !!(s && exp && mac && +exp > Date.now() && same(mac, sign(exp, s.hash)));
}
