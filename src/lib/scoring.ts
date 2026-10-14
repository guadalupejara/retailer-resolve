/**
 * Readiness score + claim alert engine.
 *
 * Pure functions, no I/O. Feed it rows from Supabase (or data/seed.json, same shape)
 * and a frozen "today", get back everything the dashboard shows:
 *   - state (scored | expired | final | routed | human_review)
 *   - 8 scoring lines with earned points, reasons, fixes, points recovered
 *   - raw total, displayed score (capped at 40 on a fatal defect), band
 *   - days left, which clock drives it, priority
 *   - recommendation + warnings
 *
 * Scoring is plain addition. A line that doesn't apply counts as earned.
 * No division anywhere.
 */

// ---------------------------------------------------------------- types
export type Terms = "prepaid" | "collect";
export type Priority = "Critical" | "High" | "Normal" | "Low";
export type Band = "Ready" | "Needs work" | "Weak";
export type CaseState = "scored" | "expired" | "final" | "routed" | "human_review";
export type Recommendation =
  | "submit" | "fix_then_submit" | "accept_write_off"
  | "log_loss" | "escalate_or_close" | "route" | "human_review";
export type Clock = "filing" | "evidence" | "response";

export interface Settings {
  demo_today: string;
  write_off_threshold: number;
  high_value_threshold: number;
  critical_days: number;
  high_days: number;
  cap_score: number;
  band_ready_min: number;
  band_needs_work_min: number;
}
export interface RequiredDoc { doc: string; points: number; when_terms?: Terms }
export interface Template { id: string; name: string; required_docs: RequiredDoc[] }
export interface TemplateLine {
  template_id: string; line_no: number; bucket: string; label: string; points: number;
  check_key: string; fatal: boolean; fatal_verified: boolean;
  why: string | null; fix: string | null; fix_owner: string | null; source: string | null;
}
export interface CodeMapping {
  id: string; retailer_id: string; code: string; code_name: string; category: string;
  template_id: string | null; channel: string; window_days: number; window_verified: boolean;
  attempt_limit: number | null; attempt_note: string | null; response_days: number | null;
  routed: boolean;
}
export interface Deduction {
  id: string; retailer_id: string; code_mapping_id: string; raw_code: string; title: string;
  po_number: string; invoice_number: string; amount: number | string; dispute_amount: number | string;
  issued_date: string; settled: boolean; grouped: boolean; dispute_summary: string | null;
  attempts_used: number; status: string; returned_on: string | null; response_due: string | null;
  hero?: number | null;
}
export interface PurchaseOrder { po_number: string; ship_to: string; item_sku: string; unit_price: number | string }
export interface Invoice { invoice_number: string; po_number: string; item_sku: string; unit_price: number | string }
export interface Shipment { po_number: string; terms: Terms; carrier_id: string; pro_number: string; delivery_date: string }
export interface Carrier { id: string; name: string; pod_retention_days: number }
export interface Asn { po_number: string; sent_at: string; received_at: string; carton_ids_present: boolean }
export interface Evidence { id: string; deduction_id: string; doc_type: string; extracted: Record<string, any> }
export interface DisputeHistory {
  deduction_id: string; attempt_no: number; outcome: string;
  denial_reason: string | null; denial_check_key: string | null;
}

/** Everything one case needs. Build it with bundleFor(). */
export interface CaseBundle {
  deduction: Deduction; mapping: CodeMapping; template: Template | null; lines: TemplateLine[];
  po: PurchaseOrder | null; invoice: Invoice | null; shipment: Shipment | null;
  carrier: Carrier | null; asn: Asn | null; evidence: Evidence[]; history: DisputeHistory[];
}

export interface LineResult {
  line_no: number; bucket: string; label: string; points: number; earned: number;
  passed: boolean; not_applicable: boolean; fatal: boolean; fatal_verified: boolean;
  reason: string;            // what the engine found, plain language
  why: string | null; fix: string | null; fix_owner: string | null; source: string | null;
  points_recovered: number;  // points gained if this line is fixed
  score_if_fixed: number | null; // displayed score after fixing only this line
}

export interface CaseResult {
  id: string; state: CaseState;
  lines: LineResult[];
  raw: number | null;        // sum of earned points, before the cap
  display: number | null;    // what the UI shows
  capped: boolean; capped_by: string[];
  band: Band | null;
  priority: Priority | null;
  days_left: number | null;  // earliest active clock
  clock: Clock | null;       // which clock that is
  deadlines: { filing: string; evidence_expiry: string | null; response_due: string | null };
  likely_valid: boolean;     // evidence suggests the retailer was right
  recommendation: Recommendation;
  warnings: string[];
}

// ---------------------------------------------------------------- helpers
const CARRIER_DOCS = ["pod", "bol", "delivery_confirmation"];
const cents = (v: number | string) => Math.round(Number(v) * 100);
const DAY = 86_400_000;
const toUtc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const daysBetween = (fromIso: string, toIso: string) => Math.round((toUtc(toIso) - toUtc(fromIso)) / DAY);
const addDays = (iso: string, n: number) => new Date(toUtc(iso) + n * DAY).toISOString().slice(0, 10);

function proofDocFor(b: CaseBundle): string | null {
  if (!b.template) return null;
  if (b.template.id === "shortage_wmt") return b.shipment?.terms === "collect" ? "bol" : "pod";
  if (b.template.id === "shortage_amz") return "delivery_confirmation";
  return null;
}
const ev = (b: CaseBundle, doc: string) => b.evidence.find((e) => e.doc_type === doc) ?? null;

interface CheckOut { pass: boolean; na?: boolean; earned?: number; reason: string; likelyValid?: boolean }

// ---------------------------------------------------------------- checks
function runCheck(key: string, b: CaseBundle): CheckOut {
  const d = b.deduction;
  const terms = b.shipment?.terms ?? "prepaid";
  const proofDoc = proofDocFor(b);

  switch (key) {
    case "docs_present": {
      const req = (b.template?.required_docs ?? []).filter((r) => !r.when_terms || r.when_terms === terms);
      const has = (doc: string) => doc === "po" ? !!b.po : doc === "invoice" ? !!b.invoice : !!ev(b, doc);
      const missing = req.filter((r) => !has(r.doc));
      const earned = req.filter((r) => has(r.doc)).reduce((s, r) => s + r.points, 0);
      return missing.length
        ? { pass: false, earned, reason: `Missing: ${missing.map((m) => DOC_LABEL[m.doc] ?? m.doc).join(", ")}` }
        : { pass: true, earned, reason: "All required documents attached" };
    }
    case "po_matches": {
      const tid = b.template?.id;
      let sources: { label: string; po: string | null | undefined }[] = [];
      if (tid === "shortage_wmt" || tid === "shortage_amz") {
        sources = b.evidence.filter((e) => CARRIER_DOCS.includes(e.doc_type))
          .map((e) => ({ label: DOC_LABEL[e.doc_type], po: e.extracted.po_number }));
      } else if (tid === "pricing_wmt") {
        const c = ev(b, "claim");
        if (!c) return { pass: false, reason: "Claim not attached, so the PO can't be checked" };
        sources = [{ label: "Claim", po: c.extracted.po_number }];
      } else if (tid === "asn_amz") {
        const f = ev(b, "asn_file");
        if (!f) return { pass: false, reason: "ASN file not attached, so the PO can't be checked" };
        sources = [{ label: "ASN file", po: f.extracted.po_number }];
      }
      if (b.invoice) sources.push({ label: "Invoice", po: b.invoice.po_number });
      const bad = sources.filter((s) => s.po !== d.po_number);
      if (!bad.length) return { pass: true, reason: `PO ${d.po_number} on every document` };
      return {
        pass: false,
        reason: bad.map((s) => s.po == null ? `${s.label}: PO number unreadable` : `${s.label} shows PO ${s.po}`).join("; ")
          + `; expected ${d.po_number}`,
      };
    }
    case "shipto_matches": {
      const docs = b.evidence.filter((e) => CARRIER_DOCS.includes(e.doc_type));
      if (!docs.length) return { pass: false, reason: "No carrier document to check the delivery address" };
      const bad = docs.filter((e) => e.extracted.ship_to !== b.po?.ship_to);
      return bad.length
        ? { pass: false, reason: bad.map((e) => e.extracted.ship_to == null
            ? `${DOC_LABEL[e.doc_type]}: address unreadable`
            : `${DOC_LABEL[e.doc_type]} shows ${e.extracted.ship_to}`).join("; ") + `; PO ships to ${b.po?.ship_to}` }
        : { pass: true, reason: `Delivered to ${b.po?.ship_to}` };
    }
    case "proof_signed": {
      const p = proofDoc ? ev(b, proofDoc) : null;
      if (!p) return { pass: false, reason: `No ${DOC_LABEL[proofDoc ?? "pod"]} to check for a stamp or signature` };
      if (p.extracted.legible === false) return { pass: false, reason: `${DOC_LABEL[p.doc_type]} is illegible; stamp can't be confirmed` };
      return p.extracted.stamp_or_signature
        ? { pass: true, reason: `${DOC_LABEL[p.doc_type]} is stamped or signed` }
        : { pass: false, reason: p.doc_type === "bol" ? "BOL has no carrier signature" : "POD has no DC stamp or store signature" };
    }
    case "delivery_confirmed": {
      const p = ev(b, "delivery_confirmation");
      if (!p) return { pass: false, reason: "No carrier delivery confirmation attached" };
      return p.extracted.delivered
        ? { pass: true, reason: "Carrier confirms full delivery" }
        : { pass: false, likelyValid: true,
            reason: `Carrier confirmation shows a short delivery (${p.extracted.cartons_delivered ?? "partial"})` };
    }
    case "amount_matches":
      return cents(d.amount) === cents(d.dispute_amount)
        ? { pass: true, reason: `Dispute amount equals the deduction ($${Number(d.amount).toFixed(2)})` }
        : { pass: false, reason: `Dispute amount $${Number(d.dispute_amount).toFixed(2)} vs deduction $${Number(d.amount).toFixed(2)}` };
    case "proof_type_fits": {
      if (!proofDoc) return { pass: true, na: true, reason: "Not applicable" };
      return ev(b, proofDoc)
        ? { pass: true, reason: `${terms === "collect" ? "Collect" : "Prepaid"} shipment, ${DOC_LABEL[proofDoc]} attached` }
        : { pass: false, reason: `${terms === "collect" ? "Collect" : "Prepaid"} shipment needs a ${DOC_LABEL[proofDoc]}` };
    }
    case "settled":
      return d.settled ? { pass: true, reason: "Deduction is posted" } : { pass: false, reason: "Deduction still pending in the retailer's system" };
    case "grouped":
      return d.grouped ? { pass: true, reason: "Related items grouped" } : { pass: false, reason: "Related chargebacks or claims not grouped" };
    case "summary_written":
      return d.dispute_summary?.trim() ? { pass: true, reason: "Summary written" } : { pass: false, reason: "No dispute summary yet" };
    case "item_matches":
      return b.invoice && b.po && b.invoice.item_sku === b.po.item_sku
        ? { pass: true, reason: `Item ${b.po.item_sku} matches` }
        : { pass: false, reason: `Invoice item ${b.invoice?.item_sku} vs PO item ${b.po?.item_sku}` };
    case "price_matches":
      return b.invoice && b.po && cents(b.invoice.unit_price) === cents(b.po.unit_price)
        ? { pass: true, reason: `Invoice price matches PO ($${Number(b.po.unit_price).toFixed(2)})` }
        : { pass: false, likelyValid: true,
            reason: `Invoiced $${Number(b.invoice?.unit_price).toFixed(2)} vs PO $${Number(b.po?.unit_price).toFixed(2)}` };
    case "carton_ids_present":
      return b.asn?.carton_ids_present
        ? { pass: true, reason: "ASN carried carton IDs" } : { pass: false, reason: "ASN has no SSCC or AMZNCC carton IDs" };
    case "sent_before_receipt": {
      if (!b.asn) return { pass: false, reason: "No ASN record" };
      const ok = Date.parse(b.asn.sent_at) < Date.parse(b.asn.received_at);
      return ok ? { pass: true, reason: "ASN sent before Amazon received the shipment" }
        : { pass: false, likelyValid: true, reason: "ASN sent after Amazon received the shipment" };
    }
    case "carton_opened":
    case "units_visible":
    case "barcode_legible": {
      const p = ev(b, "carton_photo");
      if (!p) return { pass: false, reason: "No carton photo attached" };
      const ok = !!p.extracted[key];
      const label = { carton_opened: "Carton opened", units_visible: "Inner packs and units visible",
        barcode_legible: "Barcode legible" }[key];
      return ok ? { pass: true, reason: `${label} in photo` } : { pass: false, reason: `${label}: not shown in photo` };
    }
    case "prior_denial_addressed": {
      if (d.attempts_used === 0) return { pass: true, na: true, reason: "First dispute" };
      const last = [...b.history].filter((h) => h.outcome === "denied" && h.denial_check_key)
        .sort((x, y) => y.attempt_no - x.attempt_no)[0];
      if (!last) return { pass: true, na: true, reason: "No prior denial reason on file" };
      const now = runCheck(last.denial_check_key!, b);
      return now.pass
        ? { pass: true, reason: `Last denial ("${last.denial_reason}") is now fixed` }
        : { pass: false, reason: `Last denial ("${last.denial_reason}") is still not fixed` };
    }
    default:
      return { pass: false, reason: `Unknown check ${key}` };
  }
}

const DOC_LABEL: Record<string, string> = {
  pod: "POD", bol: "BOL", delivery_confirmation: "delivery confirmation", claim: "claim",
  asn_file: "ASN file", carton_photo: "carton photo", po: "PO", invoice: "invoice",
};

// ---------------------------------------------------------------- main
export function scoreCase(b: CaseBundle, s: Settings): CaseResult {
  const d = b.deduction;
  const today = s.demo_today;
  const filing = addDays(d.issued_date, b.mapping.window_days);
  const warnings: string[] = [];
  if (!b.mapping.window_verified) warnings.push(`Filing window unverified: ${b.mapping.attempt_note ?? "confirm with retailer"}`);

  // ---- lines
  let lines: LineResult[] = [];
  let likelyValid = false;
  if (b.template) {
    lines = [...b.lines].sort((x, y) => x.line_no - y.line_no).map((l) => {
      const r = runCheck(l.check_key, b);
      if (r.likelyValid) likelyValid = true;
      const earned = r.pass ? l.points : (r.earned ?? 0);
      return {
        line_no: l.line_no, bucket: l.bucket, label: l.label, points: l.points, earned,
        passed: r.pass, not_applicable: !!r.na, fatal: l.fatal, fatal_verified: l.fatal_verified,
        reason: r.reason, why: l.why, fix: l.fix, fix_owner: l.fix_owner, source: l.source,
        points_recovered: l.points - earned, score_if_fixed: null,
      };
    });
  }
  const raw = b.template ? lines.reduce((sum, l) => sum + l.earned, 0) : null;
  const fatalFails = lines.filter((l) => l.fatal && !l.passed);
  const capped = fatalFails.length > 0;
  const display = raw == null ? null : capped ? Math.min(raw, s.cap_score) : raw;
  for (const l of lines) {
    if (l.passed) continue;
    const otherFatal = fatalFails.some((f) => f.line_no !== l.line_no);
    const newRaw = (raw ?? 0) + l.points_recovered;
    l.score_if_fixed = otherFatal ? Math.min(newRaw, s.cap_score) : newRaw;
  }
  for (const f of fatalFails) if (!f.fatal_verified) warnings.push(`"${f.label}" is treated as fatal by assumption, not a published rule`);

  // ---- clocks
  const proofDoc = proofDocFor(b);
  const carrierLines = new Set(["po_matches", "shipto_matches", "proof_signed", "delivery_confirmed", "docs_present"]);
  const carrierProblem = !!proofDoc && !likelyValid && (
    !ev(b, proofDoc) ||
    lines.some((l) => !l.passed && carrierLines.has(b.lines.find((x) => x.line_no === l.line_no)!.check_key) &&
      !(l.line_no === 1 && ev(b, proofDoc))) // docs line failing only for a non-carrier doc doesn't count
  );
  const evidenceExpiry = carrierProblem && b.shipment && b.carrier
    ? addDays(b.shipment.delivery_date, b.carrier.pod_retention_days) : null;
  const responseDue = d.status === "supplier_action" ? d.response_due : null;

  const clocks: [Clock, string][] = [["filing", filing]];
  if (evidenceExpiry) clocks.push(["evidence", evidenceExpiry]);
  if (responseDue) clocks.push(["response", responseDue]);
  const [clock, due] = clocks.reduce((a, c) => (c[1] < a[1] ? c : a));
  const daysLeft = daysBetween(today, due);
  if (evidenceExpiry && evidenceExpiry < filing) {
    warnings.push(`Carrier proof expires ${evidenceExpiry}, before the filing deadline ${filing}. Request it now.`);
  }

  // ---- state + gates
  let state: CaseState = "scored";
  if (b.mapping.routed) state = "routed";
  else if (daysBetween(today, filing) < 0) state = "expired";
  else if (b.mapping.attempt_limit != null && d.attempts_used >= b.mapping.attempt_limit) state = "final";
  else if (!b.template) state = "human_review";

  if (b.mapping.attempt_limit != null && d.attempts_used === b.mapping.attempt_limit - 1 && state === "scored") {
    warnings.push("Last attempt: if this is denied, it can't be disputed again. Fix everything before submitting.");
  }
  if (b.mapping.attempt_limit == null && d.attempts_used >= 5) warnings.push("Five or more attempts: win rates drop sharply.");

  // ---- priority
  const amt = Number(d.amount);
  let priority: Priority | null = null;
  if (state !== "expired" && state !== "final") {
    if (amt < s.write_off_threshold) priority = "Low";
    else if (daysLeft <= s.critical_days) priority = "Critical";
    else if (daysLeft <= s.high_days || amt >= s.high_value_threshold) priority = "High";
    else priority = "Normal";
  }

  // ---- band + recommendation
  const band: Band | null = display == null ? null
    : display >= s.band_ready_min ? "Ready" : display >= s.band_needs_work_min ? "Needs work" : "Weak";
  const priorFail = lines.some((l) => l.line_no === 8 && !l.passed);
  let recommendation: Recommendation;
  if (state === "expired") recommendation = "log_loss";
  else if (state === "final") recommendation = "escalate_or_close";
  else if (state === "routed") recommendation = "route";
  else if (state === "human_review") recommendation = "human_review";
  else if (likelyValid) recommendation = "accept_write_off";
  else if (band === "Ready" && !priorFail) recommendation = "submit";
  else recommendation = "fix_then_submit";

  return {
    id: d.id, state, lines: state === "scored" ? lines : [],
    raw: state === "scored" ? raw : null, display: state === "scored" ? display : null,
    capped: state === "scored" && capped, capped_by: state === "scored" ? fatalFails.map((f) => f.label) : [],
    band: state === "scored" ? band : null,
    priority, days_left: state === "expired" || state === "final" ? null : daysLeft,
    clock: state === "expired" || state === "final" ? null : clock,
    deadlines: { filing, evidence_expiry: evidenceExpiry, response_due: responseDue },
    likely_valid: likelyValid, recommendation, warnings,
  };
}

// ---------------------------------------------------------------- queue
const PRIORITY_RANK: Record<string, number> = { Critical: 0, High: 1, Normal: 2, Low: 3 };
/** Alert queue order: priority, then dollars at stake (high first), then score (weak first). */
export function sortQueue(rows: { result: CaseResult; amount: number }[]) {
  return [...rows].sort((a, b) =>
    (PRIORITY_RANK[a.result.priority ?? ""] ?? 9) - (PRIORITY_RANK[b.result.priority ?? ""] ?? 9) ||
    b.amount - a.amount ||
    (a.result.display ?? 999) - (b.result.display ?? 999));
}

// ---------------------------------------------------------------- data glue
export interface SeedLike {
  settings: Settings | { key: string; value: string }[];
  templates: Template[]; template_lines: TemplateLine[]; code_mappings: CodeMapping[];
  purchase_orders: PurchaseOrder[]; invoices: Invoice[]; shipments: Shipment[]; carriers: Carrier[];
  asns: Asn[]; deductions: Deduction[]; evidence: Evidence[]; dispute_history: DisputeHistory[];
}

/** Accepts either the settings object from seed.json or the key/value rows from Supabase. */
export function parseSettings(raw: SeedLike["settings"]): Settings {
  if (!Array.isArray(raw)) return raw;
  const o: Record<string, string> = Object.fromEntries(raw.map((r) => [r.key, r.value]));
  const n = (k: string) => Number(o[k]);
  return {
    demo_today: o.demo_today, write_off_threshold: n("write_off_threshold"),
    high_value_threshold: n("high_value_threshold"), critical_days: n("critical_days"),
    high_days: n("high_days"), cap_score: n("cap_score"), band_ready_min: n("band_ready_min"),
    band_needs_work_min: n("band_needs_work_min"),
  };
}

export function bundleFor(seed: SeedLike, deductionId: string): CaseBundle {
  const d = seed.deductions.find((x) => x.id === deductionId);
  if (!d) throw new Error(`No deduction ${deductionId}`);
  const mapping = seed.code_mappings.find((m) => m.id === d.code_mapping_id)!;
  const template = mapping.template_id ? seed.templates.find((t) => t.id === mapping.template_id) ?? null : null;
  const shipment = seed.shipments.find((s) => s.po_number === d.po_number) ?? null;
  return {
    deduction: d, mapping, template,
    lines: template ? seed.template_lines.filter((l) => l.template_id === template.id) : [],
    po: seed.purchase_orders.find((p) => p.po_number === d.po_number) ?? null,
    invoice: seed.invoices.find((i) => i.invoice_number === d.invoice_number) ?? null,
    shipment, carrier: shipment ? seed.carriers.find((c) => c.id === shipment.carrier_id) ?? null : null,
    asn: seed.asns.find((a) => a.po_number === d.po_number) ?? null,
    evidence: seed.evidence.filter((e) => e.deduction_id === d.id),
    history: seed.dispute_history.filter((h) => h.deduction_id === d.id),
  };
}

export function scoreAll(seed: SeedLike) {
  const s = parseSettings(seed.settings);
  return seed.deductions.map((d) => ({ deduction: d, result: scoreCase(bundleFor(seed, d.id), s) }));
}
