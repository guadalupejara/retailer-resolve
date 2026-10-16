export const TODAY = new Date("2026-10-13T12:00:00Z");

export type DeductionStatus = "open" | "disputed" | "won" | "lost";
export type DocKind = "BOL" | "POD" | "Invoice" | "PO" | "ASN" | "Promo agreement" | "Photo";

export interface Retailer {
  id: string;
  name: string;
  portal: string;
  connected: boolean;
  policy: {
    disputeWindowDays: number;
    requiredDocs: DocKind[];
    rules: string[];
    updates: { date: string; text: string }[];
  };
}

export interface Deduction {
  id: string;
  retailerId: string;
  invoice: string;
  po: string;
  amount: number;
  type: "Shortage" | "Late delivery" | "Compliance fine" | "Promo" | "Pricing" | "Damage";
  code: string;
  date: string;
  status: DeductionStatus;
  qbSynced: boolean;
  dispute?: { submittedAt: string; reason: string; docIds: string[]; note: string };
}

export const retailers: Retailer[] = [
  {
    id: "walmart", name: "Walmart", portal: "Retail Link / APDP", connected: true,
    policy: {
      disputeWindowDays: 60,
      requiredDocs: ["BOL", "POD", "Invoice"],
      rules: ["OTIF fines: 3% of COGS on cases not delivered on-time, in-full", "Shortage claims require signed POD with no exceptions", "Disputes filed via APDP within 60 days of deduction"],
      updates: [{ date: "2026-10-01", text: "OTIF on-time target tightened to 90% for collect shipments." }],
    },
  },
  {
    id: "amazon", name: "Amazon", portal: "Vendor Central", connected: true,
    policy: {
      disputeWindowDays: 30,
      requiredDocs: ["ASN", "Photo", "Invoice"],
      rules: ["ASN accuracy and carton content chargebacks: 30-day window", "Two disputes per chargeback, then final"],
      updates: [],
    },
  },
  {
    id: "target", name: "Target", portal: "Partners Online", connected: true,
    policy: {
      disputeWindowDays: 90,
      requiredDocs: ["BOL", "POD", "ASN"],
      rules: ["Compliance chargebacks for missing/late ASN", "Carton labels must be GS1-128 compliant", "Dispute via POL Vendor Income Inquiry within 90 days"],
      updates: [{ date: "2026-09-18", text: "New $250 per-PO fee for ASN sent after shipment arrival." }],
    },
  },
  {
    id: "kroger", name: "Kroger", portal: "Kroger Supplier Hub", connected: true,
    policy: {
      disputeWindowDays: 30,
      requiredDocs: ["Invoice", "Promo agreement"],
      rules: ["Promo deductions must match signed promotion agreement", "Pricing disputes require cost file confirmation", "Only 30 days to dispute — strictest window"],
      updates: [{ date: "2026-10-08", text: "Supplier Hub now requires backup uploaded as PDF only." }],
    },
  },
  {
    id: "costco", name: "Costco", portal: "Costco Vendor Portal", connected: false,
    policy: {
      disputeWindowDays: 45,
      requiredDocs: ["BOL", "POD", "Photo"],
      rules: ["Damage claims require photos at receipt", "Pallet configuration must match item spec"],
      updates: [],
    },
  },
  {
    id: "wholefoods", name: "Whole Foods (UNFI)", portal: "UNFI Supplier Portal", connected: false,
    policy: {
      disputeWindowDays: 60,
      requiredDocs: ["Invoice", "Promo agreement", "POD"],
      rules: ["MCB (manufacturer chargebacks) must align with promo calendar", "Spoils allowances deducted quarterly"],
      updates: [],
    },
  },
];

/** Retailers in scope for this prototype. Sidebar and dashboard show only these. */
export const SCOPE_RETAILER_IDS = ["walmart", "amazon"];
export const inScope = (r: Retailer) => SCOPE_RETAILER_IDS.includes(r.id);

const d = (n: number) => new Date(TODAY.getTime() - n * 864e5).toISOString().slice(0, 10);

export const deductions: Deduction[] = [
  { id: "D-10421", retailerId: "walmart", invoice: "INV-88213", po: "PO-4471920", amount: 1842.5, type: "Compliance fine", code: "OTIF-OT", date: d(12), status: "open", qbSynced: true },
  { id: "D-10422", retailerId: "walmart", invoice: "INV-88190", po: "PO-4471871", amount: 6320.0, type: "Shortage", code: "SHRT-22", date: d(51), status: "open", qbSynced: true },
  { id: "D-10398", retailerId: "walmart", invoice: "INV-87902", po: "PO-4470113", amount: 912.18, type: "Late delivery", code: "OTIF-OT", date: d(70), status: "disputed", qbSynced: true, dispute: { submittedAt: d(40), reason: "Carrier delay caused by Walmart DC appointment reschedule", docIds: ["F-1"], note: "" } },
  { id: "D-10301", retailerId: "walmart", invoice: "INV-87411", po: "PO-4468820", amount: 3410.0, type: "Shortage", code: "SHRT-22", date: d(110), status: "won", qbSynced: true },
  { id: "D-10288", retailerId: "walmart", invoice: "INV-87390", po: "PO-4468731", amount: 540.0, type: "Compliance fine", code: "OTIF-IF", date: d(120), status: "lost", qbSynced: true },
  { id: "D-20117", retailerId: "target", invoice: "INV-88201", po: "PO-0093318", amount: 250.0, type: "Compliance fine", code: "ASN-LATE", date: d(8), status: "open", qbSynced: false },
  { id: "D-20118", retailerId: "target", invoice: "INV-88177", po: "PO-0093290", amount: 4185.4, type: "Shortage", code: "SHRT", date: d(80), status: "open", qbSynced: true },
  { id: "D-20090", retailerId: "target", invoice: "INV-87650", po: "PO-0092811", amount: 1200.0, type: "Damage", code: "DMG", date: d(60), status: "disputed", qbSynced: true, dispute: { submittedAt: d(30), reason: "Damage occurred after delivery — POD signed clean", docIds: ["F-6"], note: "" } },
  { id: "D-20012", retailerId: "target", invoice: "INV-87001", po: "PO-0091900", amount: 780.0, type: "Compliance fine", code: "LBL", date: d(140), status: "won", qbSynced: true },
  { id: "D-30055", retailerId: "kroger", invoice: "INV-88220", po: "PO-K77812", amount: 2975.0, type: "Promo", code: "MCB-PROMO", date: d(24), status: "open", qbSynced: true },
  { id: "D-30056", retailerId: "kroger", invoice: "INV-88221", po: "PO-K77813", amount: 640.75, type: "Pricing", code: "PRC-DIFF", date: d(5), status: "open", qbSynced: false },
  { id: "D-30011", retailerId: "kroger", invoice: "INV-87511", po: "PO-K77001", amount: 1530.0, type: "Promo", code: "MCB-PROMO", date: d(95), status: "lost", qbSynced: true },
];

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export function daysLeft(ded: Deduction, r: Retailer) {
  const age = Math.floor((TODAY.getTime() - new Date(ded.date).getTime()) / 864e5);
  return r.policy.disputeWindowDays - age;
}
