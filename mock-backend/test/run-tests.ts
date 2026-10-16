// Checks the scoring engine against the outcome each mock case was designed to produce.
// Run: node --experimental-strip-types test/run-tests.ts
import { readFileSync } from "node:fs";
import { scoreAll, sortQueue } from "../src/scoring.ts";

const root = new URL("..", import.meta.url).pathname;
const seed = JSON.parse(readFileSync(root + "data/seed.json", "utf8"));
const expected: any[] = JSON.parse(readFileSync(root + "test/expected.json", "utf8"));
const results = new Map(scoreAll(seed).map((r) => [r.deduction.id, r.result]));

let fails = 0;
for (const e of expected) {
  const r = results.get(e.id)!;
  const diffs: string[] = [];
  const cmp = (k: string, got: any, want: any) => {
    if (want !== null && want !== undefined && got !== want) diffs.push(`${k}: got ${got}, want ${want}`);
  };
  cmp("state", r.state, e.state);
  cmp("raw", r.raw, e.raw);
  cmp("display", r.display, e.display);
  cmp("band", r.band, e.band);
  cmp("days_left", r.days_left, e.days_left);
  cmp("recommendation", r.recommendation, e.recommendation);
  if (r.priority !== e.priority) diffs.push(`priority: got ${r.priority}, want ${e.priority}`);
  if (diffs.length) { fails++; console.log(`FAIL ${e.id} ${e.title}\n   ${diffs.join("\n   ")}`); }
}

// Coverage: every use case the demo needs must appear at least once
const all = [...results.values()];
const count = (f: (r: any) => boolean) => all.filter(f).length;
const coverage: [string, number][] = [
  ["Ready", count((r) => r.band === "Ready")],
  ["Needs work", count((r) => r.band === "Needs work")],
  ["Weak (capped)", count((r) => r.capped)],
  ["Uncapped but points lost", count((r) => r.state === "scored" && !r.capped && r.raw < 100)],
  ["Critical", count((r) => r.priority === "Critical")],
  ["High", count((r) => r.priority === "High")],
  ["Normal", count((r) => r.priority === "Normal")],
  ["Low", count((r) => r.priority === "Low")],
  ["Exactly 7 days", count((r) => r.days_left === 7)],
  ["Exactly 8 days", count((r) => r.days_left === 8)],
  ["Exactly 30 days", count((r) => r.days_left === 30)],
  ["Exactly 31 days", count((r) => r.days_left === 31)],
  ["Evidence clock drives deadline", count((r) => r.clock === "evidence")],
  ["Response clock drives deadline", count((r) => r.clock === "response")],
  ["Expired", count((r) => r.state === "expired")],
  ["Final (no attempts left)", count((r) => r.state === "final")],
  ["Routed", count((r) => r.state === "routed")],
  ["Human review (no template)", count((r) => r.state === "human_review")],
  ["Accept and write off", count((r) => r.recommendation === "accept_write_off")],
  ["Re-dispute, prior denial fixed", count((r) => r.lines.some((l: any) => l.line_no === 8 && !l.not_applicable && l.passed))],
  ["Re-dispute, prior denial NOT fixed", count((r) => r.lines.some((l: any) => l.line_no === 8 && !l.passed))],
  ["Last-attempt warning", count((r) => r.warnings.some((w: string) => w.startsWith("Last attempt")))],
  ["Unverified rule warning", count((r) => r.warnings.some((w: string) => w.includes("assumption") || w.includes("unverified")))],
];
console.log("\nCoverage");
for (const [k, n] of coverage) {
  console.log(`  ${n > 0 ? "ok  " : "MISS"} ${k.padEnd(36)} ${n}`);
  if (n === 0) fails++;
}

const q = sortQueue(scoreAll(seed).map((x) => ({ result: x.result, amount: Number(x.deduction.amount) })))
  .filter((x) => x.result.priority);
console.log("\nTop of alert queue");
for (const x of q.slice(0, 8)) {
  const r = x.result;
  console.log(`  ${r.priority!.padEnd(8)} $${x.amount.toFixed(2).padStart(8)}  ${String(r.display ?? "-").padStart(3)}  ${r.days_left}d (${r.clock})  ${r.id}`);
}

console.log(`\n${expected.length - (fails > 0 ? fails : 0)} checks passed; ${fails} failed`);
process.exit(fails ? 1 : 0);
