// SERVER ONLY. Imported only by the server functions in src/lib/decisions.ts. It uses the service-role key,
// which bypasses row-level security, so client code must never import this file.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { bundleFor, scoreCase, type CaseResult, type SeedLike } from "./scoring";
import { parseSettings } from "./scoring";
import { fetchSeed, type SeedDb } from "./seed";
import {
  OWNERS, canAct, isDone, settingValue, writeOffPending, STATUS_LABEL, NOTE_MAX,
  type DecisionAction, type OwnerKey, type Person, type Role,
} from "./decision-rules";

/** Saved drafts are audit rows (action draft_saved, note = the text). The newest one is the packet's summary. */
export async function runSaveDraft(input: { caseId: string; userId: string; text: string }): Promise<{ savedAt: string }> {
  const db = serviceDb();
  try {
    const user = await actorFor(db, input.userId);
    requireRole(user, "save_draft", "a deductions analyst or AR manager");
    const text = input.text.trim();
    if (!text) throw new ActionError("The draft is empty.");
    if (text.length > 2000) throw new ActionError("Drafts are limited to 2000 characters.");

    const seed = (await fetchSeed(db as unknown as SeedDb)) as SeedLike;
    const bundle = bundleFor(seed, input.caseId);
    const d = bundle.deduction;
    if (isDone(d.status) && d.status !== "submitted") throw new ActionError(`This case is already ${STATUS_LABEL[d.status]?.toLowerCase()}.`);
    const result = scoreCase(bundle, parseSettings(seed.settings));

    const at = new Date().toISOString();
    const { error } = await db.from("audit_log").insert({
      deduction_id: d.id, actor: user.id, action: "draft_saved", note: text, score_at_action: result.display ?? null, at,
    });
    if (error) throw error;
    return { savedAt: at };
  } catch (e) {
    if (e instanceof ActionError) throw e;
    console.error("[decisions] save draft failed", input.caseId, e);
    throw new Error("Couldn't save the draft. Try again.");
  }
}

export interface ActionInput {
  caseId: string;
  userId: string;
  action: DecisionAction;
  note?: string | undefined;
  owner?: OwnerKey | undefined;
  outcome?: "won" | "denied" | undefined;
}

/** Errors with a message the user can read. Anything else is logged and replaced with a generic message. */
export class ActionError extends Error {}

export function serviceDb(): SupabaseClient {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function actorFor(db: SupabaseClient, userId: string): Promise<Person> {
  const { data, error } = await db.from("app_users").select("id, name, role").eq("id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ActionError("Unknown user. Pick a user in the role switcher.");
  return data as Person;
}

function requireRole(user: Person, action: DecisionAction, who: string) {
  if (!canAct(user.role as Role, action)) throw new ActionError(`Only ${who} can do this.`);
}

const money = (n: number) => `$${n.toFixed(2)}`;

/** Runs one decision: checks the actor's role and the case's state, writes the status, then writes the audit row. */
export async function runAction(input: ActionInput): Promise<{ status: string }> {
  const db = serviceDb();
  try {
    const user = await actorFor(db, input.userId);
    const seed = await fetchSeed(db as unknown as SeedDb) as SeedLike;
    const settings = parseSettings(seed.settings);
    const threshold = settingValue(seed.settings as unknown as { key: string; value: string }[], "manager_approval_write_off_above");
    const bundle = bundleFor(seed, input.caseId);
    const d = bundle.deduction;
    const result: CaseResult = scoreCase(bundle, settings);
    const amount = Number(d.amount);

    // Submitted cases stay open for one action: recording the outcome. Everything else is closed once done.
    const outcomeOnSubmitted = input.action === "record_outcome" && d.status === "submitted";
    if (isDone(d.status) && !outcomeOnSubmitted) throw new ActionError(`This case is already ${STATUS_LABEL[d.status]?.toLowerCase()}.`);

    const { data: audit, error: auditErr } = await db.from("audit_log").select("action, at").eq("deduction_id", d.id);
    if (auditErr) throw auditErr;
    const pending = writeOffPending((audit ?? []) as { action: string; at: string }[]);

    const note = input.note?.trim() || undefined;
    if (note && note.length > NOTE_MAX) throw new ActionError(`Notes are limited to ${NOTE_MAX} characters.`);

    let status = d.status;
    let audit_action: string;
    let auditNote: string | null;

    switch (input.action) {
      case "approve": {
        requireRole(user, "approve", "a deductions analyst or AR manager");
        if (d.status === "submitted") throw new ActionError("This packet is already submitted.");
        if (!result.recommendation || result.state !== "scored") throw new ActionError("This case has no score to approve.");
        if (result.recommendation !== "submit") {
          throw new ActionError(result.recommendation === "accept_write_off" ? "Deduction looks valid." : "Fix lost points first.");
        }
        status = "submitted";
        audit_action = "approved";
        auditNote = `Dispute packet approved by ${user.name}${note ? `: ${note}` : ""}`;
        break;
      }
      case "request_document": {
        requireRole(user, "request_document", "the deductions analyst");
        if (!input.owner || !(input.owner in OWNERS)) throw new ActionError("Pick who should supply the document.");
        if (!note) throw new ActionError("Add a note for the document request.");
        audit_action = "requested_document";
        auditNote = `To ${OWNERS[input.owner]}: ${note}`;
        break;
      }
      case "write_off": {
        requireRole(user, "write_off", "a deductions analyst or AR manager");
        if (amount > threshold) throw new ActionError(`Write-offs above ${money(threshold)} need a manager. Request it instead.`);
        status = "written_off";
        audit_action = "write_off_approved";
        auditNote = `Written off by ${user.name}${note ? `: ${note}` : ""}`;
        break;
      }
      case "request_write_off": {
        requireRole(user, "request_write_off", "the deductions analyst");
        if (amount <= threshold) throw new ActionError(`Under ${money(threshold)} you can write this off directly.`);
        if (pending) throw new ActionError("A write-off for this case is already awaiting manager approval.");
        if (!note) throw new ActionError("Say why this write-off should be approved.");
        audit_action = "write_off_requested";
        auditNote = `Requested by ${user.name}: ${note}`;
        break;
      }
      case "approve_write_off": {
        requireRole(user, "approve_write_off", "the AR manager");
        if (!pending) throw new ActionError("No write-off is waiting for approval.");
        status = "written_off";
        audit_action = "write_off_approved";
        auditNote = `Approved by ${user.name}${note ? `: ${note}` : ""}`;
        break;
      }
      case "reject_write_off": {
        requireRole(user, "reject_write_off", "the AR manager");
        if (!pending) throw new ActionError("No write-off is waiting for approval.");
        if (!note) throw new ActionError("Give a reason for rejecting the write-off.");
        audit_action = "override";
        auditNote = `Write-off rejected by ${user.name}: ${note}`;
        break;
      }
      case "save_draft": {
        throw new ActionError("Drafts are saved with Save draft, not a decision.");
      }
      case "record_outcome": {
        requireRole(user, "record_outcome", "a deductions analyst or AR manager");
        if (d.status !== "submitted") throw new ActionError("Submit the dispute packet before recording an outcome.");
        if (input.outcome !== "won" && input.outcome !== "denied") throw new ActionError("Pick won or denied.");
        if (input.outcome === "denied" && !note) throw new ActionError("Give the denial reason.");
        status = input.outcome;
        audit_action = "outcome_recorded";
        auditNote = input.outcome === "won" ? "Won" : `Denied: ${note}`;
        break;
      }
    }

    if (status !== d.status) {
      const { error } = await db.from("deductions").update({ status }).eq("id", d.id);
      if (error) throw error;
    }

    const { error: insErr } = await db.from("audit_log").insert({
      deduction_id: d.id,
      actor: user.id,
      action: audit_action,
      note: auditNote,
      score_at_action: result.display ?? null,
    });
    if (insErr) throw insErr;

    if (input.action === "record_outcome") {
      const { error: archErr } = await db.from("outcomes_archive").insert({
        id: `OA-${d.id}-${Date.now()}`,
        retailer_id: d.retailer_id,
        raw_code: d.raw_code,
        amount,
        outcome: input.outcome,
        denial_reason: input.outcome === "denied" ? note ?? null : null,
        closed_on: settings.demo_today,
      });
      if (archErr) throw archErr;
    }

    return { status };
  } catch (e) {
    if (e instanceof ActionError) throw e;
    console.error("[decisions] action failed", input.action, input.caseId, e);
    throw new Error("Couldn't save this change. Try again.");
  }
}

/**
 * Demo reset. Puts every deduction back to its seed status, deletes audit rows except the seeded
 * "imported" rows, and deletes archive rows added during rehearsals (anything not in the seed).
 */
export async function runReset(): Promise<{ deductions: number; auditDeleted: boolean; archiveRemoved: number }> {
  const db = serviceDb();
  try {
    const seed = (await import("../../mock-backend/data/seed.json")).default as unknown as SeedLike & {
      deductions: { id: string; status: string }[];
      outcomes_archive: { id: string }[];
    };

    await Promise.all(
      seed.deductions.map(async (row) => {
        const { error } = await db.from("deductions").update({ status: row.status }).eq("id", row.id);
        if (error) throw error;
      }),
    );

    const { error: auditErr } = await db.from("audit_log").delete().neq("action", "imported");
    if (auditErr) throw auditErr;

    const seededIds = seed.outcomes_archive.map((o) => o.id);
    const { data: removed, error: archErr } = await db
      .from("outcomes_archive")
      .delete()
      .not("id", "in", `(${seededIds.join(",")})`)
      .select("id");
    if (archErr) throw archErr;

    return { deductions: seed.deductions.length, auditDeleted: true, archiveRemoved: removed?.length ?? 0 };
  } catch (e) {
    console.error("[decisions] reset failed", e);
    throw new Error("Reset didn't finish. Try again.");
  }
}
