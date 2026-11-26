import postgres from "postgres";

// Supabase Postgres. DATABASE_URL is the "Transaction pooler" connection string (port 6543), which suits
// serverless functions: each one keeps a small pool, and the pooler shares real connections between them.
// The transaction pooler can't keep prepared statements, hence prepare: false.
export type Q = postgres.ISql; // the database, or a transaction inside it

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Add your Supabase connection string to .env.local.");
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  return postgres(url, { prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10, ssl: local ? false : "require" });
}
const g = globalThis as unknown as { __sql?: postgres.Sql };
// Opened on first use so building the app never touches the database.
export const db = () => (g.__sql ??= create());

/** True when a write broke the named unique index (Postgres error 23505). */
export const isUniqueViolation = (e: unknown, index: string) =>
  !!e && typeof e === "object" && (e as { code?: string }).code === "23505" && (e as { constraint_name?: string }).constraint_name === index;
