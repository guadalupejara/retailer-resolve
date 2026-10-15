import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, FileDown, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AiExplanation } from "@/components/AiExplanation";
import { evidenceUrl, useChargebacks } from "@/lib/chargebacks";
import type { CaseResult, CodeMapping, Deduction, Settings } from "@/lib/scoring";
import { PRIORITY_CHIP, RETAILER_NAMES, STATE_LABEL, money } from "@/lib/queue";
import { STATUS_LABEL, settingValue } from "@/lib/decision-rules";
import { DecisionCard } from "@/components/DecisionCard";
import { AddEvidence } from "@/components/AddEvidence";
import { ScoreReadout } from "@/components/ScoreReadout";
import { isEvidenceDocType, type EvidenceDocType } from "@/lib/evidence-fields";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  CLOCK_NAME, DOC_LABEL, basename, deadlineRows, evidenceFields, lineStatus,
  notScoredReason, type EvidenceRow,
} from "@/lib/case-view";

export const Route = createFileRoute("/_authenticated/cases/$id")({
  head: ({ params }) => ({
    meta: [{ title: `${params.id} · Recoverly` }],
  }),
  component: CasePage,
});

function CasePage() {
  const { id } = Route.useParams();
  const q = useChargebacks();
  return (
    <AppShell>
      {q.isPending && <div className="panel p-10 text-center text-sm text-muted-foreground">Loading case…</div>}
      {q.isError && (
        <div className="panel border-l-4 border-l-destructive p-5 text-sm">
          <div className="font-medium text-destructive">Couldn't load this case</div>
          <div className="mt-1 text-muted-foreground">{q.error.message}</div>
        </div>
      )}
      {q.data && <CaseDetail id={id} data={q.data} />}
    </AppShell>
  );
}

function CaseDetail({ id, data }: { id: string; data: NonNullable<ReturnType<typeof useChargebacks>["data"]> }) {
  const item = data.scored.find((x) => x.deduction.id === id);
  if (!item) {
    return <div className="panel p-10 text-center text-sm text-muted-foreground">No case {id}.</div>;
  }
  const { deduction: d, result: r } = item;
  const s: Settings = data.settings;
  const mapping = data.seed.code_mappings.find((m) => m.id === d.code_mapping_id);
  const evidence = (data.seed.evidence as unknown as EvidenceRow[]).filter((e) => e.deduction_id === d.id);
  const scored = r.state === "scored";
  const template = data.seed.templates.find((t) => t.id === mapping?.template_id);
  const terms = data.seed.shipments.find((s) => s.po_number === d.po_number)?.terms;
  const docOptions = [...new Set((template?.required_docs ?? [])
    .filter((x) => !x.when_terms || x.when_terms === terms)
    .map((x) => x.doc)
    .filter(isEvidenceDocType))] as EvidenceDocType[];
  const threshold = settingValue(data.seed.settings as unknown as { key: string; value: string }[], "manager_approval_write_off_above");

  return (
    <>
      <Header id={id} d={d} r={r} mapping={mapping} />

      {r.warnings.length > 0 && (
        <div className="mt-6 space-y-2">
          {r.warnings.map((w) => {
            const urgent = w.startsWith("Last attempt");
            return (
              <div key={w} role={urgent ? "alert" : undefined}
                className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${urgent ? "border-transparent bg-destructive-soft text-destructive" : "border-transparent bg-warning-soft"}`}>
                <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${urgent ? "" : "text-warning-foreground"}`} />
                <div>
                  <span className="font-semibold">{urgent ? "Last attempt" : "Heads up"}</span>{" "}
                  <span className={urgent ? "" : "text-muted-foreground"}>{urgent ? w.replace(/^Last attempt:?\s*/, "") : w}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        {/* Left column: the investigation. */}
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {scored ? <ReadinessHero id={id} r={r} s={s} /> : <NotScoredHero r={r} d={d} mapping={mapping} s={s} />}
          {scored && <PointsBreakdown r={r} />}
          {scored && <AiExplanation id={id} result={r} />}
          <EvidenceCard id={id} evidence={evidence} docOptions={docOptions} />
        </div>

        {/* Right column: the call. Normal page flow, so everything in it is always fully visible. */}
        <aside className="min-w-0 space-y-6">
          {scored
            ? <DecisionCard caseId={id} d={d} result={r} threshold={threshold} />
            : <PlaceholderCard title="Decision" note="Decisions are made on scored cases. This case is not scored." />}
          <DeadlinesCard r={r} />
        </aside>
      </div>

      {/* Activity spans both columns at the bottom. */}
      <div className="mt-6">
        <ActivityTimeline caseId={id} limit={6} />
      </div>
    </>
  );
}

/* ---------- Header ---------- */

/** Two lines: chips, id and title; then retailer · code · amount · days left · attempt. */
function Header({ id, d, r, mapping }: { id: string; d: Deduction; r: CaseResult; mapping: CodeMapping | undefined }) {
  const limit = mapping?.attempt_limit;
  const urgent = r.days_left != null && r.days_left <= 7;
  const meta: ReactNode[] = [
    RETAILER_NAMES[d.retailer_id] ?? d.retailer_id,
    !mapping ? d.raw_code : mapping.code === mapping.code_name ? mapping.code : `${mapping.code} – ${mapping.code_name}`,
    money(Number(d.amount)),
    r.days_left == null ? "No active clock" : (
      <span className={urgent ? "font-medium text-destructive" : ""}>
        {r.days_left} {r.days_left === 1 ? "day" : "days"} left{r.clock ? ` (${CLOCK_NAME[r.clock]})` : ""}
      </span>
    ),
    limit != null ? `Attempt ${Math.min(d.attempts_used + 1, limit)} of ${limit}` : `Attempt ${d.attempts_used + 1}`,
  ];
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          {r.priority && <span className={`${PRIORITY_CHIP[r.priority]} shrink-0`}>{r.priority}</span>}
          <span className="num shrink-0 text-sm font-semibold text-muted-foreground">{d.id}</span>
          <h1 className="max-w-full min-w-0 truncate font-display text-[22px] leading-tight font-semibold tracking-[-0.02em]" title={d.title}>{d.title}</h1>
          <span className="chip-neutral shrink-0">{STATUS_LABEL[d.status] ?? d.status}</span>
          {r.state !== "scored" && <span className="chip-neutral shrink-0">{STATE_LABEL[r.state]}</span>}
        </div>
        <p className="num mt-1.5 text-[13px] break-words text-muted-foreground">
          {meta.map((m, i) => <Fragment key={i}>{i > 0 && <span className="mx-1.5" aria-hidden>·</span>}{m}</Fragment>)}
        </p>
      </div>
      {d.status === "submitted" && (
        <Link to="/cases/$id/packet" params={{ id }} target="_blank" className="btn-outline shrink-0">
          <FileDown className="size-4" /> Export packet
        </Link>
      )}
    </header>
  );
}

/* ---------- Left column ---------- */

const BAND_TINT: Record<string, string> = {
  Ready: "bg-success/[0.05] border-success/25",
  "Needs work": "bg-warning/[0.08] border-warning/35",
  Weak: "bg-destructive/[0.05] border-destructive/20",
};

function ReadinessHero({ id, r, s }: { id: string; r: CaseResult; s: Settings }) {
  return (
    <section className={`panel p-6 ${r.band ? BAND_TINT[r.band] : ""}`}>
      <div className="eyebrow">Readiness score</div>
      <div className="mt-3">
        <ScoreReadout id={id} r={r} cap={s.cap_score} needsWorkMin={s.band_needs_work_min} readyMin={s.band_ready_min} />
      </div>
    </section>
  );
}

function NotScoredHero({ r, d, mapping, s }: { r: CaseResult; d: Deduction; mapping: CodeMapping | undefined; s: Settings }) {
  const reason = notScoredReason(r, d, mapping, s);
  return (
    <section className="panel bg-secondary/40 p-6">
      <div className="eyebrow">Not scored</div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.02em]">{STATE_LABEL[r.state]}</div>
      {reason && <p className="mt-2 text-sm text-muted-foreground">{reason}</p>}
    </section>
  );
}

function PointsBreakdown({ r }: { r: CaseResult }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (n: number) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(n)) next.delete(n); else next.add(n);
    return next;
  });
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-baseline justify-between px-5 pt-5 pb-3">
        <h2 className="section-title">Points breakdown</h2>
        {r.capped && r.raw != null && <span className="num text-sm text-muted-foreground">{r.raw} before cap</span>}
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-y border-border bg-secondary/40 text-left">
          <tr>
            <th className="px-5 py-2.5">Check</th><th className="px-3 py-2.5">Result</th>
            <th className="px-3 py-2.5 text-right">Points</th><th className="px-5 py-2.5 text-right"><span className="sr-only">If fixed</span></th>
          </tr>
        </thead>
        <tbody>
          {r.lines.map((l) => {
            const status = lineStatus(l);
            const failed = status === "fail";
            const isOpen = open.has(l.line_no);
            return (
              <Fragment key={l.line_no}>
                <tr className={`border-b border-border last:border-0 ${failed ? "cursor-pointer hover:bg-secondary/50" : ""}`}
                  onClick={failed ? () => toggle(l.line_no) : undefined}>
                  <td className="px-5 py-3">
                    <div className="text-[11px] font-medium text-muted-foreground">{l.bucket}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      {failed ? (
                        <button type="button" aria-expanded={isOpen} className="inline-flex items-center gap-1 text-left font-medium"
                          onClick={(e) => { e.stopPropagation(); toggle(l.line_no); }}>
                          {isOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                          {l.label}
                        </button>
                      ) : <span className="pl-5 font-medium">{l.label}</span>}
                      {l.fatal && <span className="chip-lost">Fatal</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={status === "pass" ? "chip-won" : failed ? "chip-lost" : "chip-neutral"}>
                      {status === "pass" ? "Pass" : failed ? "Fail" : "N/A"}
                    </span>
                  </td>
                  <td className="num px-3 py-3 text-right">{l.earned}/{l.points}</td>
                  <td className="num px-5 py-3 text-right text-xs font-semibold whitespace-nowrap text-success">
                    {failed && l.points_recovered > 0 ? `+${l.points_recovered} if fixed` : ""}
                  </td>
                </tr>
                {failed && isOpen && (
                  <tr className="border-b border-border bg-secondary/30 last:border-0">
                    <td colSpan={4} className="px-5 pt-1 pb-4 pl-10 text-sm">
                      <div><span className="text-muted-foreground">Found: </span>{l.reason}</div>
                      {l.fix && <div className="mt-1"><span className="text-muted-foreground">Fix: </span>{l.fix}</div>}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      </div>
    </section>
  );
}

function EvidenceCard({ id, evidence, docOptions }: { id: string; evidence: EvidenceRow[]; docOptions: EvidenceDocType[] }) {
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
        <h2 className="section-title">Evidence</h2>
        {docOptions.length > 0 && (
          <button type="button" className="btn-primary !py-1.5 text-xs" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add evidence
          </button>
        )}
      </div>

      {evidence.length === 0 ? (
        <div className="border-t border-border px-5 py-6 text-sm text-muted-foreground">
          {docOptions.length > 0 ? "No evidence files for this case yet." : "This case doesn't need any evidence documents."}
        </div>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {evidence.map((e) => {
            const isOpen = open === e.id;
            return (
              <li key={e.id}>
                <div className="flex items-center gap-3 px-5 py-3">
                  <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    {isOpen ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
                    <span className="shrink-0 text-sm font-medium">{DOC_LABEL[e.doc_type] ?? e.doc_type}</span>
                    {e.variant && <span className="chip-neutral">{e.variant}</span>}
                    <span className="num min-w-0 truncate text-xs text-muted-foreground" title={basename(e.storage_path)}>{basename(e.storage_path)}</span>
                  </button>
                  <a href={evidenceUrl(e.storage_path)} target="_blank" rel="noopener noreferrer" className="btn-ghost !px-2 !py-1 text-xs">
                    Open <ExternalLink className="size-3.5" />
                  </a>
                </div>
                {isOpen && (
                  <div className="px-5 pb-4 pl-11">
                    <div className="rounded-xl border border-dashed border-border p-4">
                      <div className="eyebrow">AI-read, please verify</div>
                      <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                        {evidenceFields(e.extracted).map(([k, v]) => (
                          <div key={k} className="flex min-w-0 gap-2 break-words">
                            <dt className="text-muted-foreground">{k}:</dt>
                            <dd className="num">{v}</dd>
                          </div>
                        ))}
                      </dl>
                      {e.extraction_note && <div className="mt-2 text-xs text-muted-foreground">{e.extraction_note}</div>}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Add evidence</SheetTitle>
            <SheetDescription>Saving replaces this case's document of that type and rescores the case.</SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <AddEvidence caseId={id} docOptions={docOptions} evidence={evidence} embedded onSaved={() => setAdding(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}

/* ---------- Right column ---------- */

function DeadlinesCard({ r }: { r: CaseResult }) {
  return (
    <section className="panel p-5">
      <h2 className="section-title">Deadlines</h2>
      <div className="mt-3 space-y-2">
        {deadlineRows(r).map((row) => (
          <div key={row.key} className={`rounded-xl px-3 py-2.5 text-sm ${row.driving ? "bg-destructive/10 ring-1 ring-destructive/30" : "bg-secondary/60"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={row.driving ? "font-medium text-destructive" : ""}>{row.label}</span>
              {row.driving && r.days_left != null && <span className="num font-semibold text-destructive">{r.days_left}d left</span>}
            </div>
            <div className="num mt-0.5 text-xs text-muted-foreground">{row.date ?? row.empty}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlaceholderCard({ title, note = "Coming next." }: { title: string; note?: string }) {
  return (
    <section className="panel p-5">
      <h2 className="section-title">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{note}</p>
    </section>
  );
}
