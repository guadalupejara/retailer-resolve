import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { evidenceUrl, useChargebacks } from "@/lib/chargebacks";
import type { CaseResult, CodeMapping, Deduction, Settings } from "@/lib/scoring";
import { BAND_CHIP, RECOMMENDATION_LABEL, RETAILER_NAMES, STATE_LABEL, money } from "@/lib/queue";
import {
  DOC_LABEL, RECOMMENDATION_TEXT, basename, deadlineRows, evidenceFields, groupLines, lineStatus,
  notScoredReason, type EvidenceRow,
} from "@/lib/case-view";

export const Route = createFileRoute("/_authenticated/cases/$id")({
  head: ({ params }) => ({
    meta: [{ title: `${params.id} · Recoup` }],
  }),
  component: CasePage,
});

function CasePage() {
  const { id } = Route.useParams();
  const q = useChargebacks();
  return (
    <AppShell>
      <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Alert queue</Link>
      {q.isPending && <div className="panel mt-6 p-10 text-center text-sm text-muted-foreground">Loading case…</div>}
      {q.isError && (
        <div className="panel mt-6 border-l-4 border-l-destructive p-5 text-sm">
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
    return <div className="panel mt-6 p-10 text-center text-sm text-muted-foreground">No case {id}.</div>;
  }
  const { deduction: d, result: r } = item;
  const s: Settings = data.settings;
  const mapping = data.seed.code_mappings.find((m) => m.id === d.code_mapping_id);
  const evidence = (data.seed.evidence as unknown as EvidenceRow[]).filter((e) => e.deduction_id === d.id);
  const scored = r.state === "scored";

  return (
    <>
      <Header d={d} r={r} mappingLabel={mapping ? `${mapping.code} · ${mapping.code_name}` : d.raw_code} amount={Number(d.amount)} />

      {r.warnings.length > 0 && (
        <div className="mt-6 space-y-2">
          {r.warnings.map((w) => {
            const urgent = w.startsWith("Last attempt");
            return (
              <div key={w} className={`panel flex gap-3 border-l-4 p-4 text-sm ${urgent ? "border-l-destructive text-destructive" : "border-l-warning"}`}>
                <span className="font-semibold">{urgent ? "Last attempt" : "Heads up"}</span>
                <span className={urgent ? "" : "text-muted-foreground"}>{urgent ? w.replace(/^Last attempt:?\s*/, "") : w}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {scored ? <ScorePanel r={r} s={s} /> : <NotScoredPanel r={r} d={d} mapping={mapping} s={s} />}
        <DeadlinesPanel r={r} />
        <RecommendationPanel r={r} />
      </div>

      {scored && (
        <section className="mt-10">
          <h2 className="text-2xl">Scoring breakdown</h2>
          <div className="mt-4 space-y-6">
            {groupLines(r.lines).map((g) => (
              <div key={g.bucket}>
                <div className="flex items-baseline justify-between">
                  <div className="eyebrow">{g.bucket}</div>
                  <div className="num text-xs text-muted-foreground">{g.earned}/{g.points}</div>
                </div>
                <div className="panel mt-2 divide-y divide-border">
                  {g.lines.map((l) => {
                    const status = lineStatus(l);
                    return (
                      <div key={l.line_no} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1fr_auto]">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{l.label}</span>
                            {l.fatal && <span className="chip-lost">Fatal</span>}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{l.reason}</div>
                          {status === "fail" && l.fix && (
                            <div className="mt-1 text-xs">
                              <span className="text-foreground">Fix:</span> {l.fix}
                            </div>
                          )}
                        </div>
                        <div className="flex items-start gap-3 md:justify-end">
                          <span className={status === "pass" ? "chip-won" : status === "fail" ? "chip-lost" : "chip bg-muted text-muted-foreground"}>
                            {status === "pass" ? "Pass" : status === "fail" ? "Fail" : "N/A"}
                          </span>
                          <span className="num text-xs">{l.earned}/{l.points}</span>
                          {status === "fail" && l.points_recovered > 0 && (
                            <span className="num text-xs font-semibold text-success">+{l.points_recovered} if fixed</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-2xl">Evidence</h2>
        {evidence.length === 0 ? (
          <div className="panel mt-4 p-6 text-sm text-muted-foreground">No evidence files for this case yet.</div>
        ) : (
          <div className="mt-4 space-y-4">
            {evidence.map((e) => (
              <div key={e.id} className="panel p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">{DOC_LABEL[e.doc_type] ?? e.doc_type}</span>
                  {e.variant && <span className="chip bg-muted text-muted-foreground">{e.variant}</span>}
                  <span className="num text-xs text-muted-foreground">{basename(e.storage_path)}</span>
                  <a href={evidenceUrl(e.storage_path)} target="_blank" rel="noopener noreferrer" className="btn-outline ml-auto !py-1 text-xs">Open ↗</a>
                </div>
                <div className="mt-4 rounded-md border border-dashed border-border p-4">
                  <div className="eyebrow">AI-read, please verify</div>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    {evidenceFields(e.extracted).map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="text-muted-foreground">{k}:</dt>
                        <dd className="num">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {e.extraction_note && <div className="mt-2 text-xs text-muted-foreground">{e.extraction_note}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <PlaceholderCard title="AI explanation" />
        <PlaceholderCard title="Decision" />
      </div>
    </>
  );
}

function Header({ d, r, mappingLabel, amount }: { d: Deduction; r: CaseResult; mappingLabel: string; amount: number }) {
  const fields: [string, string][] = [
    ["Retailer", RETAILER_NAMES[d.retailer_id] ?? d.retailer_id],
    ["Code", mappingLabel],
    ["Amount", money(amount)],
    ["PO", d.po_number],
    ["Invoice", d.invoice_number],
    ["Status", d.status],
    ["State", STATE_LABEL[r.state]],
  ];
  return (
    <div className="mt-4">
      <div className="eyebrow">Case</div>
      <h1 className="mt-1 text-4xl"><span className="num">{d.id}</span></h1>
      <div className="mt-2 text-base text-muted-foreground">{d.title}</div>
      <dl className="panel mt-6 grid grid-cols-2 gap-4 p-5 text-sm md:grid-cols-4 xl:grid-cols-7">
        {fields.map(([k, v]) => (
          <div key={k}>
            <dt className="eyebrow">{k}</dt>
            <dd className="num mt-1 break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ScorePanel({ r, s }: { r: CaseResult; s: Settings }) {
  return (
    <div className="panel p-6">
      <div className="eyebrow">Readiness score</div>
      <div className="mt-3 flex items-end gap-4">
        <div className="num text-6xl">{r.display ?? "—"}</div>
        {r.band && <span className={`${BAND_CHIP[r.band]} mb-2`}>{r.band}</span>}
      </div>
      {r.capped && r.raw != null && (
        <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <div className="font-medium">Capped at {s.cap_score}: would be {r.raw}</div>
          <div className="mt-1 text-xs">Fatal: {r.capped_by.join("; ")}</div>
        </div>
      )}
    </div>
  );
}

function NotScoredPanel({ r, d, mapping, s }: { r: CaseResult; d: Deduction; mapping: CodeMapping | undefined; s: Settings }) {
  const reason = notScoredReason(r, d, mapping, s);
  return (
    <div className="panel p-6">
      <div className="eyebrow">Not scored</div>
      <div className="mt-3 text-2xl">{STATE_LABEL[r.state]}</div>
      {reason && <p className="mt-3 text-sm text-muted-foreground">{reason}</p>}
    </div>
  );
}

function DeadlinesPanel({ r }: { r: CaseResult }) {
  return (
    <div className="panel p-6">
      <div className="eyebrow">Deadlines</div>
      <div className="mt-3 space-y-3">
        {deadlineRows(r).map((row) => (
          <div key={row.key} className={`rounded-md p-3 text-sm ${row.driving ? "bg-destructive/10 ring-1 ring-destructive/40" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <span>{row.label}</span>
              {row.driving && <span className="chip-lost">Drives days left</span>}
            </div>
            <div className="num mt-1 text-xs text-muted-foreground">{row.date ?? row.empty}</div>
          </div>
        ))}
      </div>
      {r.days_left != null && <div className="num mt-4 text-sm">{r.days_left} days left</div>}
    </div>
  );
}

function RecommendationPanel({ r }: { r: CaseResult }) {
  return (
    <div className="panel p-6">
      <div className="eyebrow">Recommendation</div>
      <p className="mt-3 text-lg">{RECOMMENDATION_TEXT[r.recommendation]}</p>
      <div className="mt-2 text-xs text-muted-foreground">{RECOMMENDATION_LABEL[r.recommendation]}</div>
    </div>
  );
}

function PlaceholderCard({ title }: { title: string }) {
  return (
    <div className="panel p-6">
      <div className="eyebrow">{title}</div>
      <p className="mt-3 text-sm text-muted-foreground">Coming next.</p>
    </div>
  );
}
