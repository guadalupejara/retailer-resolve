import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { atStake, denialReasons, outcomeTotals, splitHistory, type ArchiveRow, type HistoryRow } from "@/lib/insights";

const seed = JSON.parse(readFileSync(resolve(process.cwd(), "mock-backend/data/seed.json"), "utf8"));
const archive = seed.outcomes_archive as ArchiveRow[];
const history = seed.dispute_history as HistoryRow[];
const today = seed.settings.demo_today as string;

describe("insights from the seed", () => {
  it("matches the expected stat row", () => {
    const t = outcomeTotals(archive);
    expect([t.won.n, t.won.amount]).toEqual([6, 12650]);
    expect([t.denied.n, t.denied.amount]).toEqual([4, 3940]);
    expect([t.written_off.n, t.written_off.amount]).toEqual([1, 230]);
    expect([t.expired.n, t.expired.amount]).toEqual([1, 1675]);
    expect(t.recovered).toBe(12650);
    expect(t.lost).toBe(3940 + 1675);
    expect(t.winRate).toBeCloseTo(6 / 11);
  });

  it("drops dispute history dated after demo_today and lists them", () => {
    const { kept, excluded } = splitHistory(history, today);
    expect(excluded.map((h) => h.id).sort()).toEqual(["H-AMZ-006-2", "H-AMZ-009-1"]);
    expect(kept.length).toBe(history.length - 2);
  });

  it("puts POD not stamped by DC first with 4 denials", () => {
    const { kept } = splitHistory(history, today);
    const top = denialReasons(archive, kept)[0]!;
    expect(top.reason).toBe("POD not stamped by DC");
    expect(top.count).toBe(4);
    expect(top.checkKey).toBe("proof_signed");
  });
});

describe("what's at stake", () => {
  it("sums open dollars by band and by fatal check", () => {
    const s = atStake([
      { amount: 100, band: "Ready", capped_by: [] },
      { amount: 200, band: "Weak", capped_by: ["Stamp or signature present"] },
      { amount: 300, band: "Weak", capped_by: ["Stamp or signature present", "PO number matches"] },
    ]);
    expect(s.byBand["Ready"]?.amount).toBe(100);
    expect(s.byBand["Weak"]?.amount).toBe(500);
    expect(s.blocked[0]).toEqual({ check: "Stamp or signature present", n: 2, amount: 500 });
  });
});
