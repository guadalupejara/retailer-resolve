// Pure view helpers for the case page and the documents page. Nothing here scores anything:
// every number, band, clock and recommendation comes from scoring.ts via useChargebacks().
import { daysBetween, type CaseResult, type Clock, type CodeMapping, type Deduction, type LineResult, type Settings } from "./scoring";
import { RETAILER_NAMES } from "./queue";

/** evidence rows as the Supabase table has them (the engine's Evidence type leaves out the file columns). */
export interface EvidenceRow {
  id: string;
  deduction_id: string;
  doc_type: string;
  storage_path: string;
  variant: string | null;
  extracted: Record<string, unknown>;
  extraction_note: string | null;
}

export const DOC_LABEL: Record<string, string> = {
  pod: "Proof of delivery",
  bol: "Bill of lading",
  delivery_confirmation: "Delivery confirmation",
  claim: "Claim",
  asn_file: "ASN file",
  carton_photo: "Carton photo",
};

export const CLOCK_NAME: Record<Clock, string> = {
  filing: "Filing deadline",
  evidence: "Carrier proof expires",
  response: "Retailer response due",
};

export const RECOMMENDATION_TEXT: Record<string, string> = {
  submit: "Ready to submit as is.",
  fix_then_submit: "Fix the lost points below, then submit.",
  accept_write_off: "The retailer looks right. Accept the deduction and write it off.",
  log_loss: "The filing window closed. Log this as a loss.",
  escalate_or_close: "No attempts left. Escalate or close the case.",
  route: "This code is routed elsewhere. Don't file it here.",
  human_review: "No template for this code. A person needs to decide.",
};

export const basename = (path: string) => path.split("/").pop() ?? path;

/** Groups the 8 scoring lines by bucket, keeping the template's order. */
export function groupLines(lines: LineResult[]) {
  const groups = new Map<string, LineResult[]>();
  for (const l of lines) groups.set(l.bucket, [...(groups.get(l.bucket) ?? []), l]);
  return [...groups.entries()].map(([bucket, items]) => ({
    bucket,
    lines: items,
    earned: items.reduce((t, l) => t + l.earned, 0),
    points: items.reduce((t, l) => t + l.points, 0),
  }));
}

/** Pass / fail / not-applicable for one scoring line. */
export function lineStatus(l: LineResult): "pass" | "fail" | "n/a" {
  if (l.not_applicable) return "n/a";
  return l.passed ? "pass" : "fail";
}

/** The three clocks. The one that drives days_left is flagged. */
export function deadlineRows(r: CaseResult) {
  const { filing, evidence_expiry, response_due } = r.deadlines;
  const rows: { key: Clock; date: string | null; empty: string }[] = [
    { key: "filing", date: filing, empty: "" },
    { key: "evidence", date: evidence_expiry, empty: "Not at risk" },
    { key: "response", date: response_due, empty: "No open request" },
  ];
  return rows.map((row) => ({ ...row, label: CLOCK_NAME[row.key], driving: r.clock === row.key && row.date !== null }));
}

/** Plain-words reason for the states that have no score. */
export function notScoredReason(r: CaseResult, d: Deduction, mapping: CodeMapping | undefined, s: Settings): string | null {
  switch (r.state) {
    case "expired": {
      const ago = daysBetween(r.deadlines.filing, s.demo_today);
      return `The filing window closed on ${r.deadlines.filing}, ${ago} days ago.`;
    }
    case "final":
      return `All ${mapping?.attempt_limit ?? "?"} attempts are used (${d.attempts_used} of ${mapping?.attempt_limit ?? "?"}). It can't be disputed again.`;
    case "routed":
      return `This code is routed to ${mapping?.channel ?? "another channel"}. It isn't filed here.`;
    case "human_review":
      return `Code ${d.raw_code} has no scoring template, so a person needs to review it.`;
    default:
      return null;
  }
}

/** Extracted fields for display: snake_case keys become labels, booleans become Yes/No. */
export function evidenceFields(extracted: Record<string, unknown>): [string, string][] {
  return Object.entries(extracted).map(([k, v]) => {
    const label = k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
    const value = typeof v === "boolean" ? (v ? "Yes" : "No") : v == null || v === "" ? "—" : String(v);
    return [label, value];
  });
}

/** Documents page: retailer → case → files, filtered by a search string. */
export function documentGroups(evidence: EvidenceRow[], deductions: Deduction[], query: string) {
  const q = query.trim().toLowerCase();
  const byId = new Map(deductions.map((d) => [d.id, d]));
  return Object.keys(RETAILER_NAMES).map((retailerId) => {
    const cases = new Map<string, { deduction: Deduction; files: EvidenceRow[] }>();
    for (const e of evidence) {
      const d = byId.get(e.deduction_id);
      if (!d || d.retailer_id !== retailerId) continue;
      const haystack = [DOC_LABEL[e.doc_type] ?? e.doc_type, e.variant ?? "", basename(e.storage_path), d.id, d.title, d.po_number]
        .join(" ").toLowerCase();
      if (q && !haystack.includes(q)) continue;
      const entry = cases.get(d.id) ?? { deduction: d, files: [] };
      entry.files.push(e);
      cases.set(d.id, entry);
    }
    return {
      retailerId,
      name: RETAILER_NAMES[retailerId],
      cases: [...cases.values()].sort((a, b) => a.deduction.id.localeCompare(b.deduction.id)),
    };
  }).filter((g) => g.cases.length > 0);
}
