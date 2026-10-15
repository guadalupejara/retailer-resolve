import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { AiOutcome } from "@/lib/ai-explain";
import { explainCase } from "@/lib/explain-case";
import type { CaseResult } from "@/lib/scoring";

const LABEL = "AI-suggested, review before sending";
const BUSY = "AI is busy right now. Try again in a moment.";

const PATH_LABEL: Record<"primary" | "backup", string> = {
  primary: "Live",
  backup: "Live (backup model)",
};

/**
 * AI explanation card. Gemini explains the engine's points and drafts text. Scores and points come
 * from scoring.ts (the points badges below use the engine's numbers, not the AI's effect text).
 * Generation happens on click, never on page load.
 */
export function AiExplanation({ id, result }: { id: string; result: CaseResult }) {
  const [outcome, setOutcome] = useState<AiOutcome | null>(null);
  const [draft, setDraft] = useState("");
  const generate = useMutation({
    mutationFn: () => explainCase({ data: id }),
    onSuccess: (o) => {
      setOutcome(o);
      if (o.mode !== "unavailable") setDraft(o.explanation.summary);
    },
    // A failed request is shown as the busy message too. The raw error stays out of the UI.
    onError: () => setOutcome({ mode: "unavailable" }),
  });

  const explanation = outcome && outcome.mode !== "unavailable" ? outcome.explanation : null;
  const isWriteOff = result.recommendation === "accept_write_off";
  const pointsFor = (lineNo: number) => result.lines.find((l) => l.line_no === lineNo)?.points_recovered ?? 0;
  const fixes = [...(explanation?.fixes ?? [])].sort((a, b) => pointsFor(b.line_no) - pointsFor(a.line_no) || a.line_no - b.line_no);
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const pathLabel = outcome?.mode === "live" ? PATH_LABEL[outcome.path] : outcome?.mode === "cached" ? "Saved response" : null;

  return (
    <section className="panel p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="eyebrow">AI explanation</div>
        <span className="chip-disputed">{LABEL}</span>
        {pathLabel && <span className="chip bg-muted text-muted-foreground">{pathLabel}</span>}
        <button className="btn-primary ml-auto !py-1.5 text-xs" onClick={() => generate.mutate()} disabled={generate.isPending}>
          {generate.isPending ? "Reviewing evidence…" : explanation ? "Regenerate" : outcome ? "Retry" : "Generate"}
        </button>
      </div>

      {generate.isPending && (
        <div className="mt-4 text-sm text-muted-foreground" role="status">Reviewing evidence…</div>
      )}

      {!outcome && !generate.isPending && (
        <p className="mt-4 text-sm text-muted-foreground">Not generated yet. Click Generate to ask for an explanation of this case.</p>
      )}

      {outcome?.mode === "unavailable" && !generate.isPending && (
        <p className="mt-4 text-sm text-muted-foreground">{BUSY}</p>
      )}

      {explanation && (
        <div className="mt-5 space-y-6">
          <div className="text-xl font-medium leading-snug">{explanation.headline}</div>

          {isWriteOff ? (
            <div className="rounded-md border border-border p-4">
              <div className="eyebrow">Why this looks valid</div>
              <p className="mt-2 text-sm">{explanation.summary}</p>
            </div>
          ) : (
            <>
              <div>
                <div className="eyebrow">Fixes, most points first</div>
                {fixes.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No fixes needed.</p>}
                <ol className="mt-3 space-y-3">
                  {fixes.map((f) => {
                    const line = result.lines.find((l) => l.line_no === f.line_no);
                    return (
                      <li key={f.line_no} className="rounded-md border border-border p-4 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{line?.label ?? `Line ${f.line_no}`}</span>
                          <span className="chip-open">+{pointsFor(f.line_no)} pts</span>
                          <span className="chip bg-muted text-muted-foreground">Owner: {f.owner}</span>
                        </div>
                        <div className="mt-2"><span className="text-muted-foreground">Why: </span>{f.why}</div>
                        <div className="mt-1"><span className="text-muted-foreground">Fix: </span>{f.fix}</div>
                        <div className="mt-1 text-xs text-muted-foreground">Effect (AI text): {f.effect}</div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <label htmlFor="ai-draft" className="eyebrow">Draft dispute summary · {LABEL}</label>
                  <span className={`num text-xs ${words > 80 ? "text-destructive" : "text-muted-foreground"}`}>{words}/80 words</span>
                </div>
                <textarea
                  id="ai-draft"
                  className="input mt-2 min-h-32"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
