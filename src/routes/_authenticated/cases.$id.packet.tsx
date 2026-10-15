import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { AI_CACHE } from "@/lib/ai-cache";
import { explainCase } from "@/lib/explain-case";
import { evidenceUrl, useChargebacks } from "@/lib/chargebacks";
import { useActivity } from "@/lib/activity";
import { useCurrentUser } from "@/lib/current-user";
import { ACTION_LABEL, STATUS_LABEL } from "@/lib/decision-rules";
import { DOC_LABEL, basename, groupLines, lineStatus } from "@/lib/case-view";
import { RETAILER_NAMES, money } from "@/lib/queue";

export const Route = createFileRoute("/_authenticated/cases/$id/packet")({
  head: ({ params }) => ({
    meta: [{ title: `Dispute packet ${params.id} · Recoverly` }],
  }),
  component: PacketPage,
});

const PT = (iso: string) => `${new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" })} PT`;

/** Print-friendly dispute packet. No app shell, so nothing but the packet prints. */
function PacketPage() {
  const { id } = Route.useParams();
  const q = useChargebacks();
  const activity = useActivity(id);
  const { users } = useCurrentUser();
  const [generated, setGenerated] = useState<string | null>(null);
  const gen = useMutation({
    mutationFn: () => explainCase({ data: id }),
    onSuccess: (o) => setGenerated(o.mode === "unavailable" ? null : o.explanation.summary),
  });

  if (q.isPending || activity.isPending) return <Page><p className="text-sm text-muted-foreground">Loading packet…</p></Page>;
  if (q.isError) return <Page><p className="text-sm text-destructive">Couldn't load this case. {q.error.message}</p></Page>;
  if (activity.isError) return <Page><p className="text-sm text-destructive">Couldn't load the approval record. Try again.</p></Page>;

  const item = q.data.scored.find((x) => x.deduction.id === id);
  if (!item) return <Page><p className="text-sm">No case {id}.</p></Page>;
  const { deduction: d, result: r } = item;
  if (d.status !== "submitted") {
    return (
      <Page>
        <p className="text-sm">Packets are for submitted cases. {id} is {(STATUS_LABEL[d.status] ?? d.status).toLowerCase()}.</p>
        <Link to="/cases/$id" params={{ id }} className="mt-4 inline-block text-sm underline">Back to the case</Link>
      </Page>
    );
  }

  const seed = q.data.seed;
  const mapping = seed.code_mappings.find((m) => m.id === d.code_mapping_id);
  const evidence = (seed.evidence as unknown as { id: string; deduction_id: string; doc_type: string; storage_path: string; variant: string | null }[])
    .filter((e) => e.deduction_id === id);
  const nameOf = (actor: string) => users.find((u) => u.id === actor)?.name ?? (actor === "system" ? "System" : actor);
  const rows = activity.data ?? [];
  const draft = rows.find((x) => x.action === "draft_saved");
  const approval = rows.find((x) => x.action === "approved");
  const cached = AI_CACHE[id]?.summary;
  const summary = draft
    ? { text: draft.note ?? "", source: `Saved by ${nameOf(draft.actor)} on ${PT(draft.at)}` }
    : cached
      ? { text: cached, source: "Saved AI draft" }
      : generated
        ? { text: generated, source: "Generated just now" }
        : null;

  return (
    <Page>
      <div className="flex items-center justify-between gap-4 print:hidden">
        <Link to="/cases/$id" params={{ id }} className="text-xs text-muted-foreground hover:text-foreground">← Back to the case</Link>
        <button className="btn-primary" onClick={() => window.print()}>Print / Save as PDF</button>
      </div>

      <header className="mt-6 border-b border-border pb-4">
        <div className="text-xs font-medium text-muted-foreground">Dispute packet</div>
        <h1 className="mt-1 page-title"><span className="num">{d.id}</span> · {d.title}</h1>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <Field k="Retailer" v={RETAILER_NAMES[d.retailer_id] ?? d.retailer_id} />
        <Field k="Code" v={mapping ? `${mapping.code} · ${mapping.code_name}` : d.raw_code} />
        <Field k="Deducted" v={money(Number(d.amount))} />
        <Field k="Dispute amount" v={money(Number(d.dispute_amount))} />
        <Field k="PO" v={d.po_number} />
        <Field k="Invoice" v={d.invoice_number} />
        <Field k="Status" v={STATUS_LABEL[d.status] ?? d.status} />
        <Field k="Readiness score" v={r.display == null ? "—" : `${r.display}${r.capped && r.raw != null ? ` (raw ${r.raw})` : ""} · ${r.band ?? ""}`} />
      </dl>

      <section className="mt-8">
        <h2 className="section-title">Dispute summary</h2>
        {summary ? (
          <>
            <p className="mt-2 whitespace-pre-wrap text-sm">{summary.text}</p>
            <p className="mt-2 text-xs text-muted-foreground">AI-suggested, review before sending. {summary.source}.</p>
          </>
        ) : (
          <div className="mt-2 print:hidden">
            <p className="text-sm text-muted-foreground">No saved draft yet. Generate one, or save an edited draft on the case page.</p>
            <button className="btn-outline mt-2 !py-1 text-xs" disabled={gen.isPending} onClick={() => gen.mutate()}>
              {gen.isPending ? "Generating…" : "Generate summary"}
            </button>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="section-title">Score breakdown</h2>
        {r.state !== "scored" ? (
          <p className="mt-2 text-sm text-muted-foreground">This case has no score breakdown (state: {r.state}).</p>
        ) : (
          groupLines(r.lines).map((g) => (
            <div key={g.bucket} className="mt-3">
              <div className="flex justify-between text-xs font-medium text-muted-foreground">
                <span>{g.bucket}</span><span className="num">{g.earned}/{g.points}</span>
              </div>
              <table className="mt-1 w-full text-sm">
                <tbody>
                  {g.lines.map((l) => {
                    const st = lineStatus(l);
                    return (
                      <tr key={l.line_no} className="border-b border-border align-top">
                        <td className="py-1.5 pr-2">{l.label}{l.fatal && <span className="ml-2 text-xs">(fatal)</span>}</td>
                        <td className="py-1.5 pr-2 text-xs">{st === "pass" ? "Pass" : st === "fail" ? "Fail" : "N/A"}</td>
                        <td className="num py-1.5 pr-2 text-right text-xs">{l.earned}/{l.points}</td>
                        <td className="py-1.5 text-xs text-muted-foreground">{l.reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))
        )}
      </section>

      <section className="mt-8">
        <h2 className="section-title">Evidence</h2>
        {evidence.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No evidence on file.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {evidence.map((e) => {
              const url = new URL(evidenceUrl(e.storage_path), window.location.origin).href;
              return (
                <li key={e.id}>
                  <span className="font-medium">{DOC_LABEL[e.doc_type] ?? e.doc_type}</span>
                  {e.variant && <span className="text-muted-foreground"> ({e.variant})</span>}: {basename(e.storage_path)}
                  <div className="break-all text-xs"><a href={url} target="_blank" rel="noopener noreferrer" className="underline">{url}</a></div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-10 border-t border-border pt-4 text-sm">
        <h2 className="section-title">Approval</h2>
        {approval ? (
          <p className="mt-2">Approved by {nameOf(approval.actor)} on {PT(approval.at)}.</p>
        ) : (
          <p className="mt-2 text-muted-foreground">No approval found in the audit log.</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{ACTION_LABEL["approved"]}: from the audit log.</p>
      </section>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl bg-white px-6 py-8 text-black print:max-w-none print:px-0 print:py-0">{children}</div>;
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{k}</dt>
      <dd className="num mt-0.5 break-words">{v}</dd>
    </div>
  );
}
