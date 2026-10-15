// Server functions for the Decision card and the demo reset. The browser calls these; the work and the
// service-role key stay in decisions.server.ts.
import { createServerFn } from "@tanstack/react-start";
import type { ActionInput } from "./decisions.server";
import { OWNERS, type DecisionAction, type OwnerKey } from "./decision-rules";

const ACTIONS: DecisionAction[] = [
  "approve", "request_document", "write_off", "request_write_off", "approve_write_off", "reject_write_off", "record_outcome",
];

export const takeCaseAction = createServerFn({ method: "POST" })
  .validator((d: ActionInput) => {
    if (typeof d?.caseId !== "string" || !/^[A-Za-z0-9-]{1,32}$/.test(d.caseId)) throw new Error("Invalid case id");
    if (typeof d.userId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(d.userId)) throw new Error("Invalid user id");
    if (!ACTIONS.includes(d.action)) throw new Error("Unknown action");
    if (d.owner !== undefined && !(d.owner in OWNERS)) throw new Error("Unknown owner");
    if (d.outcome !== undefined && d.outcome !== "won" && d.outcome !== "denied") throw new Error("Unknown outcome");
    if (d.note !== undefined && typeof d.note !== "string") throw new Error("Note must be text");
    return { caseId: d.caseId, userId: d.userId, action: d.action, note: d.note, owner: d.owner as OwnerKey | undefined, outcome: d.outcome };
  })
  .handler(async ({ data }) => {
    const { runAction } = await import("./decisions.server");
    return runAction(data);
  });

export const saveDraft = createServerFn({ method: "POST" })
  .validator((d: { caseId: string; userId: string; text: string }) => {
    if (typeof d?.caseId !== "string" || !/^[A-Za-z0-9-]{1,32}$/.test(d.caseId)) throw new Error("Invalid case id");
    if (typeof d.userId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(d.userId)) throw new Error("Invalid user id");
    if (typeof d.text !== "string") throw new Error("Draft must be text");
    return d;
  })
  .handler(async ({ data }) => {
    const { runSaveDraft } = await import("./decisions.server");
    return runSaveDraft(data);
  });

export const resetDemo = createServerFn({ method: "POST" }).handler(async () => {
  const { runReset, serviceDb } = await import("./decisions.server");
  const { resetEvidence } = await import("./evidence.server");
  const seed = (await import("../../mock-backend/data/seed.json")).default;
  const demo = await runReset();
  const evidence = await resetEvidence(serviceDb(), seed.evidence);
  return { ...demo, ...evidence };
});

export const addEvidence = createServerFn({ method: "POST" })
  .validator((d: { caseId: string; userId: string; docType: string; fields: Record<string, string | boolean | number | null>; fileName: string; fileBase64: string; variant: "uploaded" | "demo" }) => {
    if (typeof d?.caseId !== "string" || !/^[A-Za-z0-9-]{1,32}$/.test(d.caseId)) throw new Error("Invalid case id");
    if (typeof d.userId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(d.userId)) throw new Error("Invalid user id");
    if (typeof d.fileBase64 !== "string" || typeof d.fileName !== "string") throw new Error("Choose a file first.");
    if (d.variant !== "uploaded" && d.variant !== "demo") throw new Error("Unknown file source");
    if (typeof d.fields !== "object" || d.fields === null) throw new Error("Fields must be an object");
    return d;
  })
  .handler(async ({ data }) => {
    const { runAddEvidence } = await import("./evidence.server");
    return runAddEvidence(data);
  });
