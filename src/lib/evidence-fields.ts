// Evidence document types and the extracted fields each one uses (from mock-backend/data/seed.json).
// Shared by the server (validation) and the Add evidence form. Only these doc types exist in the evidence table.

export const EVIDENCE_DOC_TYPES = ["pod", "bol", "delivery_confirmation", "claim", "asn_file", "carton_photo"] as const;
export type EvidenceDocType = (typeof EVIDENCE_DOC_TYPES)[number];

export type FieldKind = "text" | "bool" | "number";
export interface FieldSpec { key: string; kind: FieldKind }

const carrier: FieldSpec[] = [
  { key: "po_number", kind: "text" }, { key: "ship_to", kind: "text" }, { key: "stamp_or_signature", kind: "bool" },
  { key: "delivery_date", kind: "text" }, { key: "pro_number", kind: "text" }, { key: "legible", kind: "bool" },
];

export const EVIDENCE_FIELDS: Record<EvidenceDocType, FieldSpec[]> = {
  pod: carrier,
  bol: carrier,
  claim: [
    { key: "claim_number", kind: "text" }, { key: "po_number", kind: "text" }, { key: "amount", kind: "number" }, { key: "legible", kind: "bool" },
  ],
  asn_file: [
    { key: "po_number", kind: "text" }, { key: "sent_at", kind: "text" }, { key: "carton_ids_present", kind: "bool" }, { key: "legible", kind: "bool" },
  ],
  carton_photo: [
    { key: "carton_opened", kind: "bool" }, { key: "units_visible", kind: "bool" }, { key: "barcode_legible", kind: "bool" }, { key: "legible", kind: "bool" },
  ],
  delivery_confirmation: [
    { key: "po_number", kind: "text" }, { key: "ship_to", kind: "text" }, { key: "delivered", kind: "bool" },
    { key: "cartons_delivered", kind: "text" }, { key: "tracking", kind: "text" }, { key: "legible", kind: "bool" },
  ],
};

export const isEvidenceDocType = (v: string): v is EvidenceDocType => (EVIDENCE_DOC_TYPES as readonly string[]).includes(v);

/** Storage paths of seeded mock files start with "evidence/". Uploads live under "<case id>/". */
export const isSeedPath = (storagePath: string) => storagePath.startsWith("evidence/");

export const ALLOWED_FILE_EXT = ["pdf", "png", "jpg", "jpeg", "txt"] as const;
export const MAX_FILE_BYTES = 6 * 1024 * 1024;

/** What the score panel needs from a rescore: the engine's numbers before and after the document was saved. */
export interface ScoreSummary {
  display: number | null;
  raw: number | null;
  capped: boolean;
  band: "Ready" | "Needs work" | "Weak" | null;
  priority: "Critical" | "High" | "Normal" | "Low" | null;
  days_left: number | null;
  clock: "filing" | "evidence" | "response" | null;
  recommendation: string;
  state: string;
}

/**
 * Demo files for the "Use demo file" shortcut. WMT-001 gets its own stamped POD, with WMT-001's PO, ship-to,
 * PRO number and delivery date (made by mock-backend/generator/make_demo_pod.py). Other cases use WMT-006's POD.
 */
export const DEMO_FILES = {
  "WMT-001": { url: "/evidence/demo/WMT-001-pod-stamped.pdf", name: "WMT-001-pod-stamped.pdf", label: "stamped POD, WMT-001" },
  default: { url: "/evidence/WMT-006/pod.pdf", name: "pod.pdf", label: "stamped POD, WMT-006" },
} as const;

export function demoFileFor(caseId: string) {
  return caseId === "WMT-001" ? DEMO_FILES["WMT-001"] : DEMO_FILES.default;
}
