import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { scoreAll, sortQueue } from "@/lib/scoring";
import { buildQueue, type QueueRow } from "@/lib/queue";
import { overview } from "@/lib/overview";

const seed = JSON.parse(readFileSync(resolve(process.cwd(), "mock-backend/data/seed.json"), "utf8"));
const scored = scoreAll(seed);
const queue = sortQueue(scored.map((x) => ({ result: x.result, amount: Number(x.deduction.amount) })));
const q = buildQueue(scored, queue);
const ids = (rows: QueueRow[]) => rows.map((r) => r.deduction.id).sort();

// Expected values are read off mock-backend/data/case-catalog.csv.
describe("home overview from the seed", () => {
  const o = overview(q);

  it("counts open scored cases", () => {
    expect(o.open.count).toBe(34);
  });

  it("counts critical cases and their dollars", () => {
    expect(o.critical).toEqual({ count: 8, dollars: 18870 });
    expect(o.dueWithin7).toEqual({ count: 8, dollars: 18870 });
  });

  it("finds approvals needed: submit and due within 7 days", () => {
    expect(o.approvalsNeeded).toEqual({ count: 2, dollars: 2550 });
  });

  it("lists the top 5 in engine queue order", () => {
    expect(o.needsAttention.map((r) => r.deduction.id)).toEqual(q.scorable.slice(0, 5).map((r) => r.deduction.id));
  });

  it("splits retailers and finds the next deadline", () => {
    const [wmt, amz] = o.retailers;
    expect([wmt!.id, wmt!.openCases, wmt!.critical]).toEqual(["walmart", 21, 4]);
    expect([amz!.id, amz!.openCases, amz!.critical]).toEqual(["amazon", 13, 4]);
    expect(wmt!.next?.deduction.id).toBe("WMT-021");
    expect(amz!.next?.deduction.id).toBe("AMZ-004");
  });

  it("lists expired and final cases as closed without a decision", () => {
    expect(ids(o.closedWithoutDecision)).toEqual(["AMZ-005", "AMZ-006", "WMT-022"]);
  });

  it("moves an approved case from approvals needed to packets submitted", () => {
    // Approving sets status "submitted"; the refetch then runs the same buildQueue.
    const afterScored = scored.map((x) =>
      x.deduction.id === "AMZ-001" ? { ...x, deduction: { ...x.deduction, status: "submitted" } } : x);
    const after = overview(buildQueue(afterScored, queue));
    expect(after.approvalsNeeded).toEqual({ count: 1, dollars: 1100 });
    expect(after.open.count).toBe(33);
    expect(after.packetsSubmitted.count).toBe(o.packetsSubmitted.count + 1);
  });
});
