// Who can do what, and which cases are finished. Pure, so the server (which enforces it) and the
// Decision card (which only shows buttons the role can use) read the same rules.
// These are workflow rules, not scoring. Scores and recommendations still come from scoring.ts.

export type Role = "deductions_analyst" | "ar_manager" | "logistics" | "sales";

export interface Person {
  id: string;
  name: string;
  role: Role;
}

export type DecisionAction =
  | "approve"
  | "request_document"
  | "write_off"
  | "request_write_off"
  | "approve_write_off"
  | "reject_write_off"
  | "record_outcome";

export const ROLE_TITLE: Record<Role, string> = {
  deductions_analyst: "deductions analyst",
  ar_manager: "AR manager",
  logistics: "logistics",
  sales: "sales",
};

const ACTOR_ROLES: Record<DecisionAction, Role[]> = {
  approve: ["deductions_analyst", "ar_manager"],
  request_document: ["deductions_analyst"],
  write_off: ["deductions_analyst", "ar_manager"], // only at or under the manager threshold
  request_write_off: ["deductions_analyst"],
  approve_write_off: ["ar_manager"],
  reject_write_off: ["ar_manager"],
  record_outcome: ["deductions_analyst", "ar_manager"],
};

export function canAct(role: Role, action: DecisionAction): boolean {
  return ACTOR_ROLES[action].includes(role);
}

/** "Priya Shah (deductions analyst) or Marcus Lee (AR manager)", for the "who can" line. */
export function whoCan(users: Person[], action: DecisionAction): string {
  const names = users.filter((u) => canAct(u.role, action)).map((u) => `${u.name} (${ROLE_TITLE[u.role]})`);
  return names.length ? names.join(" or ") : "nobody in the demo";
}

export const DONE_STATUSES = ["submitted", "written_off", "won", "denied"] as const;
export type DoneStatus = (typeof DONE_STATUSES)[number];
export const isDone = (status: string): status is DoneStatus => (DONE_STATUSES as readonly string[]).includes(status);

export const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  supplier_action: "Supplier action",
  submitted: "Submitted",
  won: "Won",
  denied: "Denied",
  written_off: "Written off",
};

export const OWNERS = {
  logistics: "Dana Ortiz (logistics)",
  sales: "Sam Patel (sales)",
  warehouse: "Warehouse",
} as const;
export type OwnerKey = keyof typeof OWNERS;

export const ACTION_LABEL: Record<string, string> = {
  imported: "Imported from the retailer portal",
  evidence_added: "Added evidence",
  rescored: "Rescored",
  approved: "Approved dispute packet",
  requested_document: "Requested a document",
  write_off_requested: "Requested write-off",
  write_off_approved: "Wrote off",
  override: "Rejected write-off",
  outcome_recorded: "Recorded outcome",
};

/** Reads a value from the settings table. Accepts the key/value rows from Supabase or the seed object. */
export function settingValue(settings: { key: string; value: string }[] | Record<string, unknown>, key: string): number {
  if (Array.isArray(settings)) return Number(settings.find((r) => r.key === key)?.value);
  return Number(settings[key]);
}

/**
 * True when the newest write-off event is a request that nobody has answered yet.
 * Approvals and rejections (override) both close a request.
 */
export function writeOffPending(rows: { action: string; at: string }[]): boolean {
  const events = rows
    .filter((r) => ["write_off_requested", "write_off_approved", "override"].includes(r.action))
    .sort((a, b) => a.at.localeCompare(b.at));
  return events.at(-1)?.action === "write_off_requested";
}

/** Longest note the server accepts on a decision. */
export const NOTE_MAX = 500;
