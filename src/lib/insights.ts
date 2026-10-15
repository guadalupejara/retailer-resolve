// Insights: read-only numbers from outcomes_archive and dispute_history. Pure functions, no I/O.
// Money comes from outcomes_archive.amount (strings from Supabase are wrapped in Number()).
import { RETAILER_NAMES } from "./queue";

export interface ArchiveRow {
  id: string; retailer_id: string; raw_code: string; amount: number | string;
  outcome: "won" | "denied" | "written_off" | "expired"; denial_reason: string | null; closed_on: string;
}
export interface HistoryRow {
  id: string; deduction_id: string; attempt_no: number; submitted_on: string;
  outcome: "denied" | "won" | "returned_for_info"; denial_reason: string | null; denial_check_key: string | null;
}

export const OUTCOME_ORDER = ["won", "denied", "written_off", "expired"] as const;

/** The stat row. Win rate counts closed disputes: won / (won + denied + expired). Written off is not a dispute. */
export function outcomeTotals(rows: ArchiveRow[]) {
  const t = Object.fromEntries(OUTCOME_ORDER.map((o) => [o, { n: 0, amount: 0 }])) as Record<typeof OUTCOME_ORDER[number], { n: number; amount: number }>;
  for (const r of rows) {
    const bucket = t[r.outcome];
    if (!bucket) continue;
    bucket.n += 1;
    bucket.amount += Number(r.amount);
  }
  const closed = t.won.n + t.denied.n + t.expired.n;
  return {
    ...t,
    recovered: t.won.amount,
    lost: t.denied.amount + t.expired.amount,
    writtenOff: t.written_off.amount,
    winRate: closed ? t.won.n / closed : null,
  };
}

/** Stacked bars: one group per retailer and code. */
export function outcomeChart(rows: ArchiveRow[]) {
  const groups = new Map<string, Record<string, number | string>>();
  for (const r of rows) {
    const key = `${RETAILER_NAMES[r.retailer_id] ?? r.retailer_id} · ${r.raw_code}`;
    const g = groups.get(key) ?? { group: key, won: 0, denied: 0, written_off: 0, expired: 0 };
    g[r.outcome] = Number(g[r.outcome] ?? 0) + Number(r.amount);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => String(a["group"]).localeCompare(String(b["group"])));
}

/** Dispute history rows dated after demo_today are left out of the numbers and listed for a data fix. */
export function splitHistory(rows: HistoryRow[], today: string) {
  return {
    kept: rows.filter((r) => r.submitted_on <= today),
    excluded: rows.filter((r) => r.submitted_on > today),
  };
}

export interface ReasonRow {
  reason: string; count: number; archive: number; history: number;
  checkKey: string | null; // scoring check the reason maps to (history rows only)
}

/**
 * Denial reasons from both tables, most frequent first. A history row's denial_check_key is the scoring
 * check that reason maps to. Reasons with no check (archive rows, returned-for-info rows) show none.
 */
export function denialReasons(archive: ArchiveRow[], history: HistoryRow[]): ReasonRow[] {
  const out = new Map<string, ReasonRow>();
  const row = (reason: string) => out.get(reason) ?? { reason, count: 0, archive: 0, history: 0, checkKey: null };
  for (const r of archive) {
    if (!r.denial_reason) continue;
    const x = row(r.denial_reason);
    x.count += 1; x.archive += 1;
    out.set(r.denial_reason, x);
  }
  for (const h of history) {
    if (!h.denial_reason || h.outcome !== "denied") continue;
    const x = row(h.denial_reason);
    x.count += 1; x.history += 1;
    x.checkKey ??= h.denial_check_key;
    out.set(h.denial_reason, x);
  }
  return [...out.values()].sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

/** Open dollars by band, and dollars blocked by each fatal check. Input is the live queue's active rows. */
export function atStake(rows: { amount: number; band: string | null; capped_by: string[] }[]) {
  const byBand: Record<string, { n: number; amount: number }> = {
    Ready: { n: 0, amount: 0 }, "Needs work": { n: 0, amount: 0 }, Weak: { n: 0, amount: 0 },
  };
  const blocked = new Map<string, { n: number; amount: number }>();
  for (const r of rows) {
    if (r.band && byBand[r.band]) {
      byBand[r.band]!.n += 1;
      byBand[r.band]!.amount += r.amount;
    }
    for (const check of r.capped_by) {
      const b = blocked.get(check) ?? { n: 0, amount: 0 };
      b.n += 1; b.amount += r.amount;
      blocked.set(check, b);
    }
  }
  return {
    byBand,
    total: rows.reduce((t, r) => t + r.amount, 0),
    blocked: [...blocked.entries()].map(([check, v]) => ({ check, ...v })).sort((a, b) => b.amount - a.amount),
  };
}
