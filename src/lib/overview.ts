// Pure view-model for the home overview. Takes buildQueue()'s output and adds up what the cards show.
// No scoring here: priority, days left, recommendation and state all come from scoring.ts via the queue rows.
import type { QueueRow } from "./queue";
import { queueStats, RETAILER_NAMES } from "./queue";

const sum = (rows: QueueRow[]) => rows.reduce((t, r) => t + r.amount, 0);
const totals = (rows: QueueRow[]) => ({ count: rows.length, dollars: sum(rows) });

/** Open, scored cases the engine says to file now, due within 7 days. */
export const isApprovalNeeded = (r: QueueRow) =>
  r.result.recommendation === "submit" && r.result.days_left != null && r.result.days_left <= 7;

export const isDueWithin7 = (r: QueueRow) => r.result.days_left != null && r.result.days_left <= 7;

/** The scorable row with the fewest days left. Ties keep engine queue order. */
export function nextDeadline(rows: QueueRow[]): QueueRow | null {
  let best: QueueRow | null = null;
  for (const r of rows) {
    if (r.result.days_left == null) continue;
    if (!best || r.result.days_left < best.result.days_left!) best = r;
  }
  return best;
}

export function overview(q: { scorable: QueueRow[]; notScorable: QueueRow[]; done: QueueRow[] }) {
  const open = q.scorable;
  const byStatus = (s: string) => totals(q.done.filter((r) => r.deduction.status === s));
  return {
    open: totals(open),
    critical: totals(open.filter((r) => r.result.priority === "Critical")),
    dueWithin7: totals(open.filter(isDueWithin7)),
    approvalsNeeded: totals(open.filter(isApprovalNeeded)),
    packetsSubmitted: totals(q.done.filter((r) => ["submitted", "won", "denied"].includes(r.deduction.status))),
    needsAttention: open.slice(0, 5),
    retailers: Object.entries(RETAILER_NAMES).map(([id, name]) => {
      const rows = open.filter((r) => r.deduction.retailer_id === id);
      return { id, name, ...queueStats(rows), openCases: rows.length, next: nextDeadline(rows) };
    }),
    afterFiling: {
      submitted: byStatus("submitted"),
      won: byStatus("won"),
      denied: byStatus("denied"),
      writtenOff: byStatus("written_off"),
    },
    closedWithoutDecision: q.notScorable.filter((r) => r.result.state === "expired" || r.result.state === "final"),
  };
}
