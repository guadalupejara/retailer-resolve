import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DocList, UploadDoc } from "@/components/Docs";
import { actions, useStore } from "@/lib/store";
import { daysLeft, deductions, money } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/disputes/$deductionId")({
  loader: ({ params }) => {
    if (!deductions.find((d) => d.id === params.deductionId)) throw notFound();
    return { id: params.deductionId };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `Deduction ${loaderData?.id} · Recoup` },
      { name: "description", content: `Review and dispute deduction ${loaderData?.id}.` },
      { property: "og:title", content: `Deduction ${loaderData?.id} · Recoup` },
      { property: "og:description", content: `Review and dispute deduction ${loaderData?.id}.` },
    ],
  }),
  component: DisputePage,
});

const REASONS = [
  "Delivered in full — signed POD shows no exceptions",
  "Delivered on time — carrier/appointment records attached",
  "Promotion already paid / not authorized",
  "Price matches agreed cost file",
  "Damage occurred after delivery",
  "Duplicate deduction",
];

function DisputePage() {
  const { deductionId } = Route.useParams();
  const s = useStore();
  const d = s.deductions.find((x) => x.id === deductionId)!;
  const r = s.retailers.find((x) => x.id === d.retailerId)!;
  const docs = s.documents.filter((x) => x.retailerId === r.id);
  const related = docs.filter((x) => x.po === d.po);
  const other = docs.filter((x) => x.po !== d.po);
  const [selected, setSelected] = useState<string[]>(related.map((x) => x.id));
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [showAll, setShowAll] = useState(false);
  const left = daysLeft(d, r);
  const haveKinds = new Set(docs.filter((x) => selected.includes(x.id)).map((x) => x.kind));
  const missing = r.policy.requiredDocs.filter((k) => !haveKinds.has(k));
  const toggle = (id: string) => setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <AppShell>
      <Link to="/retailers/$retailerId" params={{ retailerId: r.id }} className="text-xs text-muted-foreground hover:text-foreground">← {r.name}</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="num text-3xl">{d.id}</h1>
        <span className={`chip-${d.status}`}>{d.status}</span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Amount", money(d.amount)], ["Type", `${d.type} (${d.code})`], ["PO", d.po], ["Invoice", d.invoice],
          ["QuickBooks", d.qbSynced ? "Matched to invoice" : "Not synced"],
        ].map(([k, v]) => (
          <div key={k} className="panel p-4"><div className="eyebrow">{k}</div><div className="num mt-1 text-sm">{v}</div></div>
        ))}
      </div>

      {d.status === "open" ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <h2 className="text-2xl">Build your dispute</h2>
            <div>
              <div className="eyebrow mb-1">Reason</div>
              <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
            <div>
              <div className="eyebrow mb-1">Note to {r.name}</div>
              <textarea className="input min-h-24" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add context for the retailer's AP team…" />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="eyebrow">Supporting documents for {d.po}</div>
                {other.length > 0 && <button className="btn-ghost !py-1 text-xs" onClick={() => setShowAll(!showAll)}>{showAll ? "Hide" : "Show"} other {r.name} docs</button>}
              </div>
              <DocList docs={showAll ? [...related, ...other] : related} selectable selected={selected} onToggle={toggle} />
            </div>
            <UploadDoc retailerId={r.id} defaultPo={d.po} onUploaded={(doc) => setSelected((p) => [...p, doc.id])} />
          </div>

          <div className="space-y-4">
            <div className={`panel p-5 ${left <= 14 ? "border-destructive/40" : ""}`}>
              <div className="eyebrow">Dispute window</div>
              <div className={`num mt-1 text-2xl ${left <= 14 ? "text-destructive" : ""}`}>{left <= 0 ? "Expired" : `${left} days left`}</div>
              <div className="mt-1 text-xs text-muted-foreground">{r.name} allows {r.policy.disputeWindowDays} days from deduction.</div>
            </div>
            <div className="panel p-5">
              <div className="eyebrow">Policy checklist</div>
              <ul className="mt-3 space-y-2 text-sm">
                {r.policy.requiredDocs.map((k) => (
                  <li key={k} className="flex items-center gap-2">
                    <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${haveKinds.has(k) ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}`}>{haveKinds.has(k) ? "✓" : ""}</span>
                    {k}
                  </li>
                ))}
              </ul>
              {missing.length > 0 && <div className="mt-3 text-xs text-warning-foreground">Missing {missing.join(", ")} — dispute may be denied.</div>}
            </div>
            <button className="btn-primary w-full" disabled={left <= 0 || selected.length === 0}
              onClick={() => actions.submitDispute(d.id, reason ?? "", selected, note)}>
              Submit dispute to {r.portal}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-8 max-w-2xl space-y-4">
          <h2 className="text-2xl">{d.status === "disputed" ? "Dispute submitted" : `Resolved — ${d.status}`}</h2>
          {d.dispute ? (
            <div className="panel space-y-3 p-5 text-sm">
              <div><span className="eyebrow">Submitted</span><div className="num">{d.dispute.submittedAt}</div></div>
              <div><span className="eyebrow">Reason</span><div>{d.dispute.reason}</div></div>
              {d.dispute.note && <div><span className="eyebrow">Note</span><div>{d.dispute.note}</div></div>}
              <div><span className="eyebrow">Attached</span>
                <DocList docs={s.documents.filter((x) => d.dispute!.docIds.includes(x.id))} />
              </div>
            </div>
          ) : <div className="text-sm text-muted-foreground">No dispute record on file.</div>}
        </div>
      )}
    </AppShell>
  );
}
