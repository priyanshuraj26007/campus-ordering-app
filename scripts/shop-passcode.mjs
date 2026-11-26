// Creates a new random dashboard passcode. Only its hash is stored, and older sign-ins stop working.
import { randomBytes, randomInt, scryptSync } from "node:crypto";
import Database from "better-sqlite3";
const db = new Database(process.env.DB_PATH || "data/campus.db", { fileMustExist: true, timeout: 5000 });
const code = String(randomInt(10000000, 100000000)), salt = randomBytes(16).toString("hex");
db.prepare("INSERT INTO shop_login VALUES ('safal', ?, ?) ON CONFLICT (shop_id) DO UPDATE SET salt=excluded.salt, hash=excluded.hash").run(salt, scryptSync(code, salt, 32).toString("hex"));
console.log(`Safal dashboard passcode: ${code}`);
