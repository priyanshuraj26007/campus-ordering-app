// Asks for Razorpay test keys, checks them with a read-only call, and saves them to .env.local.
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { createInterface } from "node:readline";
if (!process.stdin.isTTY) { console.error("Run this in your own Terminal."); process.exit(1); }
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
const ask = (q, hide) => new Promise((done) => {
  const write = rl._writeToOutput;
  rl.question(q, (a) => { rl._writeToOutput = write; if (hide) console.log(); done(a.trim()); });
  if (hide) rl._writeToOutput = () => {};
});
const id = await ask("Key ID (rzp_test_...): ");
if (!/^rzp_test_\w+$/.test(id)) { console.error("That isn't a test Key ID. Nothing saved."); process.exit(1); }
const secret = await ask("Key Secret (hidden as you paste): ", true);
rl.close();
console.log(`Received: Key ID ${id.length} characters, secret ${secret.length} characters.`);
if (secret.startsWith("rzp_")) { console.error("That was the Key ID again, not the secret. Nothing saved."); process.exit(1); }
if (!/^\w+$/.test(secret)) { console.error("That secret looks wrong. Nothing saved."); process.exit(1); }
let r;
try {
  r = await fetch("https://api.razorpay.com/v1/orders?count=1", { headers: { Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64") }, signal: AbortSignal.timeout(10000) });
} catch { console.error("Couldn't reach Razorpay. Nothing saved."); process.exit(1); }
if (!r.ok) { console.error(`Razorpay rejected these keys (${r.status}). Nothing saved.`); process.exit(1); }
const keep = existsSync(".env.local") ? readFileSync(".env.local", "utf8").split("\n").filter((l) => l && !/^RAZORPAY_KEY_(ID|SECRET)=/.test(l)) : [];
writeFileSync(".env.local", [...keep, `RAZORPAY_KEY_ID=${id}`, `RAZORPAY_KEY_SECRET=${secret}`, ""].join("\n"), { mode: 0o600 });
chmodSync(".env.local", 0o600);
console.log("Keys work and are saved. Tell Claude: keys are done");
