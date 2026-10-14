// Scores cases from rows exported out of Postgres (same shapes Supabase returns:
// numerics as strings, settings as key/value rows) and compares with seed.json results.
// Usage: node --experimental-strip-types test/run-against-db.ts <db-export.json>
import { readFileSync } from "node:fs";
import { scoreAll } from "../src/scoring.ts";

const root = new URL("..", import.meta.url).pathname;
const db = JSON.parse(readFileSync(process.argv[2], "utf8"));
const seed = JSON.parse(readFileSync(root + "data/seed.json", "utf8"));
const a = new Map(scoreAll(seed).map((r) => [r.deduction.id, r.result]));
let diff = 0;
for (const { deduction, result } of scoreAll(db)) {
  const s = a.get(deduction.id)!;
  for (const k of ["state", "raw", "display", "band", "priority", "days_left", "recommendation"] as const) {
    if ((s as any)[k] !== (result as any)[k]) { diff++; console.log(`${deduction.id} ${k}: json=${(s as any)[k]} db=${(result as any)[k]}`); }
  }
}
console.log(diff ? `${diff} differences` : "DB rows score identically to seed.json (40/40)");
process.exit(diff ? 1 : 0);
