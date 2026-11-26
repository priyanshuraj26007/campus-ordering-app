// Creates a new random dashboard passcode. Only its hash is stored, and older sign-ins stop working.
// Usage: npm run shop:passcode   (reads DATABASE_URL from .env.local)
import { randomBytes, randomInt, scryptSync } from "node:crypto";
import postgres from "postgres";

if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is missing. Add your Supabase connection string to .env.local."); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL) ? false : "require" });
try {
  if (!(await sql`select 1 from shops where id = 'safal'`).length) { console.error("Run `npm run db:setup` first."); process.exit(1); }
  const code = String(randomInt(10000000, 100000000)), salt = randomBytes(16).toString("hex");
  const hash = scryptSync(code, salt, 32).toString("hex");
  await sql`insert into shop_login values ('safal', ${salt}, ${hash})
    on conflict (shop_id) do update set salt = excluded.salt, hash = excluded.hash`;
  console.log(`Safal dashboard passcode: ${code}`);
} finally { await sql.end(); }
