import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { alertsFor, useStore } from "@/lib/store";
import { daysLeft, money, retailers } from "@/lib/data";
import { DocList, UploadDoc } from "@/components/Docs";

export const Route = createFileRoute("/_authenticated/_authenticated/retailers/$retailerId")({
  loader: ({ params }) => {
    const r = retailers.find((x) => x.id === params.retailerId);
    if (!r) throw notFound();
    return { name: r.name };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.name ?? "Retailer"} deductions · Recoup` },
      { name: "description", content: `Disputes, policy alerts and documents for ${loaderData?.name}.` },
      { property: "og:title", content: `${loaderData?.name} deductions · Recoup` },
      { property: "og:description", content: `Disputes, policy alerts and documents for ${loaderData?.name}.` },
    ],
  }),
  component: RetailerPage,
});

type Tab = "active" | "resolved" | "alerts" | "documents" | "policy";

function RetailerPage() {
  const { retailerId } = Route.useParams();
  const s = useStore();
  const r = s.retailers.find((x) => x.id === retailerId)!;
  const [tab, setTab] = useState<Tab>("active");
  const mine = s.deductions.filter((d) => d.retailerId === r.id);
  const active = mine.filter((d) => d.status === "open" || d.status === "disputed");
  const resolved = mine.filter((d) => d.status === "won" || d.status === "lost");
  const alerts = alertsFor(s, r);
  const docs = s.documents.filter((d) => d.retailerId === r.id);

  const tabs: [Tab, string, number?][] = [
    ["active", "Active", active.length],
    ["resolved", "Resolved", resolved.length],
    ["alerts", "Alerts", alerts.length],
    ["documents", "Documents", docs.length],
    ["policy", "Chargeback policy"],
  ];

  return (
    <AppShell>
      <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Dashboard</Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl">{r.name}</h1>
          <div className="mt-1 text-sm text-muted-foreground">{r.portal} · {r.policy.disputeWindowDays}-day dispute window</div>
        </div>
      </div>

      <div className="mt-8 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map(([k, label, n]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ${tab === k ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {label}{n !== undefined && <span className="ml-1.5 text-xs text-muted-foreground">{n}</span>}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {(tab === "active" || tab === "resolved") && (
          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left">
                <tr className="eyebrow">
                  <th className="px-4 py-3">Deduction</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">PO / Invoice</th>
                  <th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">{tab === "active" ? "Days left" : "Date"}</th><th />
                </tr>
              </thead>
              <tbody>
                {(tab === "active" ? active : resolved).map((d) => {
                  const left = daysLeft(d, r);
                  return (
                    <tr key={d.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
                      <td className="num px-4 py-3">{d.id}<div className="text-xs text-muted-foreground">{d.code}</div></td>
                      <td className="px-4 py-3">{d.type}</td>
                      <td className="num px-4 py-3 text-xs">{d.po}<div className="text-muted-foreground">{d.invoice}</div></td>
                      <td className="num px-4 py-3 text-right">{money(d.amount)}</td>
                      <td className="px-4 py-3"><span className={`chip-${d.status}`}>{d.status}</span></td>
                      <td className="num px-4 py-3 text-xs">
                        {tab === "resolved" ? d.date : d.status === "disputed" ? "—" :
                          <span className={left <= 14 ? "font-semibold text-destructive" : ""}>{left <= 0 ? "Expired" : `${left}d`}</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to="/disputes/$deductionId" params={{ deductionId: d.id }} className={d.status === "open" ? "btn-primary !py-1 text-xs" : "btn-ghost !py-1 text-xs"}>
                          {d.status === "open" ? "Dispute" : "View"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {(tab === "active" ? active : resolved).length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Nothing here.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "alerts" && (
          <div className="space-y-3">
            {alerts.map((a, i) => (
              <div key={i} className={`panel flex items-start gap-3 border-l-4 p-4 ${a.level === "critical" ? "border-l-destructive" : a.level === "warning" ? "border-l-warning" : "border-l-primary"}`}>
                <div className="flex-1">
                  <div className="text-sm font-medium">{a.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{a.detail}</div>
                </div>
                {a.deductionId && <Link to="/disputes/$deductionId" params={{ deductionId: a.deductionId }} className="btn-outline !py-1 text-xs">Review</Link>}
              </div>
            ))}
            {alerts.length === 0 && <div className="text-sm text-muted-foreground">No alerts. You're all caught up.</div>}
          </div>
        )}

        {tab === "documents" && (
          <div className="space-y-4">
            <UploadDoc retailerId={r.id} />
            <DocList docs={docs} />
          </div>
        )}

        {tab === "policy" && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="panel p-5">
              <div className="eyebrow">Rules</div>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">{r.policy.rules.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
            <div className="panel p-5">
              <div className="eyebrow">Required backup for disputes</div>
              <div className="mt-3 flex flex-wrap gap-2">{r.policy.requiredDocs.map((k) => <span key={k} className="chip-disputed">{k}</span>)}</div>
              <div className="eyebrow mt-6">Dispute window</div>
              <div className="num mt-2 text-2xl">{r.policy.disputeWindowDays} days</div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
