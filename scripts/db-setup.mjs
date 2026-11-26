// Creates the tables (db/schema.sql) and loads Safal's menu the first time. Safe to run again.
// Usage: npm run db:setup   (reads DATABASE_URL from .env.local)
import { readFileSync } from "node:fs";
import postgres from "postgres";

if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is missing. Add your Supabase connection string to .env.local."); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL) ? false : "require", onnotice: () => {} });
try {
  await sql.unsafe(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8")).simple();
  console.log("Tables ready.");
  const menu = JSON.parse(readFileSync(new URL("../data/safal-menu.json", import.meta.url), "utf8"));
  const added = await sql.begin(async (tx) => {
    if ((await tx`select 1 from shops where id = 'safal'`).length) return false;
    await tx`insert into shops (id, name) values ('safal', ${menu.shop})`;
    let sort = 0;
    for (const c of menu.categories) for (const i of c.items) {
      await tx`insert into items (id, shop_id, category, name, portion, sort) values (${i.id}, 'safal', ${c.name}, ${i.name}, ${i.portion ?? null}, ${sort++})`;
      await tx`insert into variants ${tx(i.variants.map((v) => ({ item_id: i.id, size: v.size, price: v.price })))}`;
    }
    return true;
  });
  const [{ items }] = await sql`select count(*)::int as items from items`;
  console.log(added ? `Menu loaded: ${items} items.` : `Menu already there (${items} items); left as it is.`);
  if (!(await sql`select 1 from shop_login`).length) console.log("Next: run `npm run shop:passcode` to get Safal's dashboard passcode.");
} finally { await sql.end(); }
