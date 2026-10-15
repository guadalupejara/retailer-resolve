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

export const resetDemo = createServerFn({ method: "POST" }).handler(async () => {
  const { runReset } = await import("./decisions.server");
  return runReset();
});
