// SERVER ONLY. Adds or replaces an evidence document, then rescores the case. Uses the service-role client
// through decisions.server.ts. Never import this from client code.
import { bundleFor, scoreCase, type CaseResult, type SeedLike, parseSettings, type Evidence } from "./scoring";
import { fetchSeed, type SeedDb } from "./seed";
import { isDone } from "./decision-rules";
import { ALLOWED_FILE_EXT, EVIDENCE_FIELDS, MAX_FILE_BYTES, isEvidenceDocType, isSeedPath } from "./evidence-fields";
import { ActionError, actorFor, serviceDb } from "./decisions.server";

export interface AddEvidenceInput {
  caseId: string;
  userId: string;
  docType: string;
  fields: Record<string, string | boolean | number | null>;
  fileName: string;
  fileBase64: string;
  variant: "uploaded" | "demo";
}

const CONTENT_TYPE: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", txt: "text/plain",
};

/** The fields the engine and the UI read, plus band and priority, for the before/after comparison. */
function summarize(r: CaseResult) {
  return {
    display: r.display, raw: r.raw, capped: r.capped, band: r.band, priority: r.priority,
    days_left: r.days_left, clock: r.clock, recommendation: r.recommendation, state: r.state,
  };
}

export async function runAddEvidence(input: AddEvidenceInput) {
  const db = serviceDb();
  try {
    const user = await actorFor(db, input.userId);
    if (!isEvidenceDocType(input.docType)) throw new ActionError("Pick a document type.");
    const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "";
    if (!(ALLOWED_FILE_EXT as readonly string[]).includes(ext)) throw new ActionError("Use a PDF, PNG, JPG or TXT file.");
    const bytes = Buffer.from(input.fileBase64, "base64");
    if (bytes.length === 0) throw new ActionError("The file is empty.");
    if (bytes.length > MAX_FILE_BYTES) throw new ActionError("The file is over 6 MB.");

    const seed = (await fetchSeed(db as unknown as SeedDb)) as SeedLike;
    const settings = parseSettings(seed.settings);
    const bundle = bundleFor(seed, input.caseId);
    const d = bundle.deduction;
    if (isDone(d.status)) throw new ActionError(`This case is already ${d.status.replace("_", " ")}. Evidence can't change it.`);

    const terms = bundle.shipment?.terms;
    const required = (bundle.template?.required_docs ?? []).filter((r) => !r.when_terms || r.when_terms === terms).map((r) => r.doc);
    if (!required.includes(input.docType)) throw new ActionError("This case doesn't need that document type.");

    const before = scoreCase(bundle, settings);
    const existing = bundle.evidence.find((e) => e.doc_type === input.docType) as (Evidence & { id: string; storage_path: string }) | undefined;

    const now = new Date().toISOString();
    const path = `${input.caseId}/${input.docType}-${Date.now()}.${ext}`;
    const fields = Object.fromEntries(EVIDENCE_FIELDS[input.docType].map((f) => [f.key, input.fields[f.key] ?? null]));
    const row = {
      storage_path: path,
      variant: input.variant,
      extracted: fields,
      extraction_note: `Entered by ${user.name}. AI-read, please verify.`,
      verified_by: user.id,
      verified_at: now,
    };

    // Score the change in memory first, so the "after" numbers match what the table will hold.
    const nextEvidence = existing
      ? seed.evidence.map((e) => (e.id === existing.id ? { ...e, ...row } : e))
      : [...seed.evidence, { id: `EV-${input.caseId}-${input.docType}-${Date.now()}`, deduction_id: input.caseId, doc_type: input.docType, ...row }];
    const after = scoreCase(bundleFor({ ...seed, evidence: nextEvidence as SeedLike["evidence"] }, input.caseId), settings);

    const { error: upErr } = await db.storage.from("evidence").upload(path, bytes, {
      contentType: CONTENT_TYPE[ext] ?? "application/octet-stream", upsert: false,
    });
    if (upErr) throw upErr;

    // Replace the existing row of this type (the engine reads only the first one). Insert only if none exists.
    const writeErr = existing
      ? (await db.from("evidence").update(row).eq("id", existing.id)).error
      : (await db.from("evidence").insert({ id: nextEvidence.at(-1)!.id, deduction_id: input.caseId, doc_type: input.docType, ...row })).error;
    if (writeErr) {
      await db.storage.from("evidence").remove([path]);
      throw writeErr;
    }

    // The file it replaced is gone from the case, so remove it from the bucket when it was an upload.
    if (existing && !isSeedPath(existing.storage_path) && existing.storage_path !== path) {
      await db.storage.from("evidence").remove([existing.storage_path]);
    }

    const { error: a1 } = await db.from("audit_log").insert({
      deduction_id: input.caseId, actor: user.id, action: "evidence_added",
      note: `${input.docType.toUpperCase()} ${existing ? "replaced" : "added"} by ${user.name}: ${input.fileName}`,
      score_at_action: before.display ?? null,
    });
    if (a1) throw a1;
    const { error: a2 } = await db.from("audit_log").insert({
      deduction_id: input.caseId, actor: user.id, action: "rescored",
      note: `Score ${before.display ?? "—"} → ${after.display ?? "—"}; band ${before.band ?? "—"} → ${after.band ?? "—"}`,
      score_at_action: after.display ?? null,
    });
    if (a2) throw a2;

    return { before: summarize(before), after: summarize(after), storagePath: path };
  } catch (e) {
    if (e instanceof ActionError) throw e;
    console.error("[evidence] add failed", input.caseId, e);
    throw new Error("Couldn't save this document. Try again.");
  }
}

/**
 * Reset for evidence: the table goes back to the rows in seed.json, and every uploaded file is removed
 * from the bucket. Files under "evidence/" are the seeded mock files and stay.
 */
/** Evidence rows as the table has them, with the file columns the engine's Evidence type leaves out. */
export interface EvidenceTableRow {
  id: string; deduction_id: string; doc_type: string; storage_path: string;
  variant: string | null; extracted: Record<string, unknown>; extraction_note: string | null;
}

export async function resetEvidence(db: ReturnType<typeof serviceDb>, seedRows: EvidenceTableRow[]) {
  const { error: delErr } = await db.from("evidence").delete().neq("id", "");
  if (delErr) throw delErr;
  const { error: insErr } = await db.from("evidence").insert(
    seedRows.map((e) => ({
      id: e.id, deduction_id: e.deduction_id, doc_type: e.doc_type, storage_path: e.storage_path,
      variant: e.variant, extracted: e.extracted, extraction_note: e.extraction_note,
    })),
  );
  if (insErr) throw insErr;

  const bucket = db.storage.from("evidence");
  const uploads: string[] = [];
  const { data: top, error: topErr } = await bucket.list("", { limit: 1000 });
  if (topErr) throw topErr;
  for (const item of top ?? []) {
    if (item.id !== null) {
      uploads.push(item.name);
      continue;
    }
    if (item.name === "evidence") continue; // seeded mock files
    const { data: files, error: fErr } = await bucket.list(item.name, { limit: 1000 });
    if (fErr) throw fErr;
    for (const f of files ?? []) if (f.id !== null) uploads.push(`${item.name}/${f.name}`);
  }
  if (uploads.length) {
    const { error: rmErr } = await bucket.remove(uploads);
    if (rmErr) throw rmErr;
  }
  return { evidenceRows: seedRows.length, filesRemoved: uploads.length };
}
