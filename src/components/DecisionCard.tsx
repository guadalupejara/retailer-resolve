import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ActionInput } from "@/lib/decisions.server";
import { takeCaseAction } from "@/lib/decisions";
import type { AiOutcome } from "@/lib/ai-explain";
import { useCurrentUser } from "@/lib/current-user";
import { useActivity } from "@/lib/activity";
import { OWNERS, STATUS_LABEL, canAct, isDone, whoCan, writeOffPending, type OwnerKey } from "@/lib/decision-rules";
import { money } from "@/lib/queue";
import type { CaseResult, Deduction } from "@/lib/scoring";

const SUGGESTED_LABEL = "AI-suggested, review before sending";

/** Why the approve button is off, or null when the packet can be approved. */
function approveBlock(r: CaseResult): string | null {
  if (r.state !== "scored") return `Case is ${r.state}. Nothing to approve.`;
  if (r.recommendation === "accept_write_off") return "Deduction looks valid";
  if (r.recommendation === "human_review") return "Needs a human review first";
  if (r.recommendation !== "submit") return "Fix lost points first";
  return null;
}

/**
 * Decision card: AI suggests, humans decide. Only buttons the current role can use are shown; for
 * everything else the card says who can. The server checks the same rules again on every action.
 */
export function DecisionCard({ caseId, d, result, threshold }: {
  caseId: string; d: Deduction; result: CaseResult; threshold: number;
}) {
  const qc = useQueryClient();
  const { currentUser, users } = useCurrentUser();
  const activity = useActivity(caseId);
  const pending = writeOffPending(activity.data ?? []);
  const ai = useQuery<AiOutcome | undefined>({ queryKey: ["ai-explain", caseId], queryFn: skipToken });

  // Suggested note: the top AI fix if one has been generated, otherwise the engine's top fix.
  const aiFixes = ai.data && ai.data.mode !== "unavailable" ? ai.data.explanation.fixes : [];
  const pointsFor = (line: number) => result.lines.find((l) => l.line_no === line)?.points_recovered ?? 0;
  const topAi = [...aiFixes].sort((a, b) => pointsFor(b.line_no) - pointsFor(a.line_no))[0];
  const topEngine = [...result.lines]
    .filter((l) => !l.passed && !l.not_applicable)
    .sort((a, b) => b.points_recovered - a.points_recovered)[0];
  const suggested = topAi ? topAi.fix : (topEngine?.fix ?? "");
  const engineOwner = topEngine?.fix_owner;
  const defaultOwner: OwnerKey = engineOwner === "sales" ? "sales" : engineOwner === "warehouse" ? "warehouse" : "logistics";

  const [ownerPick, setOwnerPick] = useState<OwnerKey | null>(null);
  const [docNote, setDocNote] = useState<string | null>(null);
  const [writeOffNote, setWriteOffNote] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [denialReason, setDenialReason] = useState("");
  const owner = ownerPick ?? defaultOwner;
  const note = docNote ?? suggested;

  const act = useMutation({
    mutationFn: (input: Omit<ActionInput, "caseId" | "userId">) =>
      takeCaseAction({ data: { ...input, caseId, userId: currentUser?.id ?? "" } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["chargebacks"] });
      void qc.invalidateQueries({ queryKey: ["audit", caseId] });
      setDocNote(null);
      setWriteOffNote("");
      setRequestReason("");
      setRejectReason("");
      setDenialReason("");
    },
  });

  const role = currentUser?.role;
  const can = (a: Parameters<typeof canAct>[1]) => !!role && canAct(role, a);
  const who = (a: Parameters<typeof canAct>[1]) => whoCan(users, a);
  const amount = Number(d.amount);
  const overThreshold = amount > threshold;
  const busy = act.isPending;
  const block = approveBlock(result);
  const statusLabel = STATUS_LABEL[d.status] ?? d.status;
  const submitted = d.status === "submitted";

  return (
    <section className="panel p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="eyebrow">Decision</div>
        <span className="chip-disputed">AI suggests, humans decide</span>
        <span className="chip bg-muted text-muted-foreground">{statusLabel}</span>
        {pending && <span className="chip-open">Awaiting manager approval</span>}
      </div>

      {act.isError && <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{act.error.message}</div>}

      {!currentUser && <p className="mt-4 text-sm text-muted-foreground">Pick a user in the role switcher to act on this case.</p>}

      {currentUser && isDone(d.status) && !submitted && (
        <p className="mt-4 text-sm text-muted-foreground">This case is {statusLabel.toLowerCase()}. No more actions.</p>
      )}

      {currentUser && (!isDone(d.status) || submitted) && (
        <div className="mt-5 divide-y divide-border">
          {/* Approve packet: once submitted, the only action left is recording the outcome */}
          {!submitted && <div className="py-4">
            <div className="font-medium">Approve dispute packet</div>
            {can("approve") ? (
              <>
                <button className="btn-primary mt-2" disabled={busy || block !== null}
                  onClick={() => act.mutate({ action: "approve" })}>
                  Approve dispute packet
                </button>
                {block && <p className="mt-2 text-xs text-muted-foreground">Disabled: {block}.</p>}
              </>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Only {who("approve")} can approve.</p>
            )}
          </div>}

          {/* Request document */}
          {!submitted && <div className="py-4">
            <div className="font-medium">Request a document</div>
            {can("request_document") ? (
              <div className="mt-2 space-y-2">
                <select className="input max-w-sm" value={owner} onChange={(e) => setOwnerPick(e.target.value as OwnerKey)}>
                  {(Object.keys(OWNERS) as OwnerKey[]).map((k) => <option key={k} value={k}>{OWNERS[k]}</option>)}
                </select>
                <textarea className="input min-h-20" value={note} onChange={(e) => setDocNote(e.target.value)} />
                <div className="text-xs text-muted-foreground">
                  {topAi ? SUGGESTED_LABEL : "Suggested from the scoring engine"}. Status stays {statusLabel.toLowerCase()}.
                </div>
                <button className="btn-outline" disabled={busy || !note.trim()}
                  onClick={() => act.mutate({ action: "request_document", owner, note: note.trim() }, { onSuccess: () => setDocNote(null) })}>
                  Request document
                </button>
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Only {who("request_document")} can request documents.</p>
            )}
          </div>}

          {/* Write-off */}
          {!submitted && <div className="py-4">
            <div className="font-medium">Write off {money(amount)}</div>
            {!overThreshold && (
              can("write_off") ? (
                <div className="mt-2 space-y-2">
                  <input className="input max-w-md" placeholder="Note (optional)" value={writeOffNote} onChange={(e) => setWriteOffNote(e.target.value)} />
                  <button className="btn-outline" disabled={busy}
                    onClick={() => act.mutate({ action: "write_off", note: writeOffNote || undefined })}>
                    Write off {money(amount)}
                  </button>
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">Only {who("write_off")} can write this off.</p>
              )
            )}
            {overThreshold && pending && (
              <div className="mt-2 space-y-3">
                <p className="text-sm">Awaiting manager approval. Above {money(threshold)} a manager decides.</p>
                {can("approve_write_off") ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-primary" disabled={busy}
                        onClick={() => act.mutate({ action: "approve_write_off" })}>
                        Approve write-off
                      </button>
                    </div>
                    <textarea className="input min-h-16" placeholder="Reason for rejecting (required to reject)"
                      value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                    <button className="btn-ghost" disabled={busy || !rejectReason.trim()}
                      onClick={() => act.mutate({ action: "reject_write_off", note: rejectReason.trim() })}>
                      Reject write-off
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Only {who("approve_write_off")} can approve or reject it.</p>
                )}
              </div>
            )}
            {overThreshold && !pending && (
              can("request_write_off") ? (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-muted-foreground">Above {money(threshold)} you request it. The AR manager decides.</p>
                  <textarea className="input min-h-16" placeholder="Why should this be written off?" value={requestReason} onChange={(e) => setRequestReason(e.target.value)} />
                  <button className="btn-outline" disabled={busy || !requestReason.trim()}
                    onClick={() => act.mutate({ action: "request_write_off", note: requestReason.trim() })}>
                    Request write-off
                  </button>
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">Above {money(threshold)} only {who("request_write_off")} can request the write-off.</p>
              )
            )}
          </div>}

          {/* Record outcome */}
          <div className="py-4">
            <div className="font-medium">Record outcome</div>
            {!submitted ? (
              <p className="mt-1 text-xs text-muted-foreground">Available once the dispute packet is submitted.</p>
            ) : can("record_outcome") ? (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary" disabled={busy} onClick={() => act.mutate({ action: "record_outcome", outcome: "won" })}>
                    Record won
                  </button>
                </div>
                <textarea className="input min-h-16" placeholder="Denial reason (required for denied)"
                  value={denialReason} onChange={(e) => setDenialReason(e.target.value)} />
                <button className="btn-ghost" disabled={busy || !denialReason.trim()}
                  onClick={() => act.mutate({ action: "record_outcome", outcome: "denied", note: denialReason.trim() }, { onSuccess: () => setDenialReason("") })}>
                  Record denied
                </button>
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Only {who("record_outcome")} can record the outcome.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
