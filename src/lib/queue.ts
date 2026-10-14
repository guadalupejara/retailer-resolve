// Pure view-model for the alert queue. Takes what useChargebacks() returns and shapes it for the page.
// No scoring happens here: score, band, priority, days left and recommendation all come from scoring.ts.
import type { Band, CaseResult, CaseState, Deduction, Priority, Recommendation, Clock } from "./scoring";

export interface QueueRow {
  deduction: Deduction;
  result: CaseResult;
  amount: number;
}

export interface QueueFilters {
  retailer?: string | undefined;
  priority?: Priority | undefined;
  band?: Band | undefined;
}

export const RETAILER_NAMES: Record<string, string> = { walmart: "Walmart", amazon: "Amazon" };
export const PRIORITIES: Priority[] = ["Critical", "High", "Normal", "Low"];
export const BANDS: Band[] = ["Ready", "Needs work", "Weak"];

export const CLOCK_LABEL: Record<Clock, string> = {
  filing: "Filing deadline",
  evidence: "Evidence proof",
  response: "Retailer response",
};

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  submit: "Submit",
  fix_then_submit: "Fix, then submit",
  accept_write_off: "Accept and write off",
  log_loss: "Log loss",
  escalate_or_close: "Escalate or close",
  route: "Route",
  human_review: "Human review",
};

export const STATE_LABEL: Record<CaseState, string> = {
  scored: "Scored",
  expired: "Expired",
  final: "Final (no attempts left)",
  routed: "Routed",
  human_review: "Human review",
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const money = (n: number) => usd.format(n);

/** "40 (raw 91)" when the fatal-defect cap is applied, otherwise just the displayed score. */
export function scoreLabel(r: CaseResult) {
  if (r.display == null) return "—";
  return r.capped && r.raw != null ? `${r.display} (raw ${r.raw})` : `${r.display}`;
}

/** Joins the engine's ordered queue back to the deduction rows, then splits scorable from not scorable. */
export function buildQueue(
  scored: { deduction: Deduction; result: CaseResult }[],
  queue: { result: CaseResult; amount: number }[],
) {
  const deductionById = new Map(scored.map((x) => [x.result.id, x.deduction]));
  const rows: QueueRow[] = queue.map((q) => ({
    deduction: deductionById.get(q.result.id)!,
    result: q.result,
    amount: q.amount,
  }));
  return {
    scorable: rows.filter((r) => r.result.state === "scored"),
    notScorable: rows.filter((r) => r.result.state !== "scored"),
  };
}

/** Retailer filter applies to both sections. Priority and band only apply to the scorable table. */
export function applyFilters(rows: QueueRow[], f: QueueFilters) {
  return rows.filter(
    (r) =>
      (!f.retailer || r.deduction.retailer_id === f.retailer) &&
      (!f.priority || r.result.priority === f.priority) &&
      (!f.band || r.result.band === f.band),
  );
}

/** Header cards. Computed over the scorable rows for the chosen retailer. */
export function queueStats(rows: QueueRow[]) {
  return {
    openDollars: rows.reduce((t, r) => t + r.amount, 0),
    critical: rows.filter((r) => r.result.priority === "Critical").length,
    readyToSubmit: rows.filter((r) => r.result.recommendation === "submit").length,
    expiringWithin7: rows.filter((r) => r.result.days_left != null && r.result.days_left <= 7).length,
  };
}
