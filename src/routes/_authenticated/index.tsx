import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowRight, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ScoreCell } from "@/components/QueueScreen";
import { useChargebacks } from "@/lib/chargebacks";
import { useCurrentUser } from "@/lib/current-user";
import { overview } from "@/lib/overview";
import { BAND_CHIP, CLOCK_LABEL, PRIORITY_CHIP, RETAILER_NAMES, STATE_LABEL, buildQueue, money, type QueueRow } from "@/lib/queue";

export const Route = createFileRoute("/_authenticated/")({
  // Old links used /?retailer=walmart. Each retailer now has its own page.
  validateSearch: (s: Record<string, unknown>): { retailer?: string | undefined } => ({
    retailer: typeof s["retailer"] === "string" && s["retailer"] in RETAILER_NAMES ? s["retailer"] : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (search.retailer) throw redirect({ to: "/retailers/$retailerId", params: { retailerId: search.retailer } });
  },
  head: () => ({
    meta: [
      { title: "Overview · Recoverly" },
      { name: "description", content: "Walmart and Amazon chargebacks: what's at stake, what's critical and what needs approval." },
      { property: "og:title", content: "Overview · Recoverly" },
      { property: "og:description", content: "Chargebacks to act on, ranked by deadline and dispute readiness." },
    ],
  }),
  component: Home,
});

function Home() {
  const q = useChargebacks();
  const { currentUser } = useCurrentUser();
  const firstName = currentUser?.name.split(" ")[0];
  const o = q.data ? overview(buildQueue(q.data.scored, q.data.queue)) : null;

  return (
    <AppShell>
      <h1 className="page-title">Good morning{firstName ? `, ${firstName}` : ""}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {o ? summaryLine(o.critical.count, o.dueWithin7.dollars) : "Loading today's cases…"}
      </p>

      {q.isError && (
        <div className="panel mt-8 border-l-4 border-l-destructive p-5 text-sm">
          <div className="font-medium text-destructive">Couldn't load the overview</div>
          <div className="mt-1 text-muted-foreground">{q.error.message}</div>
        </div>
      )}

      {/* Row 1: KPIs, each linking to the list it counts. */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Money at stake" value={o ? money(o.open.dollars) : "—"} sub={o && `${o.open.count} open cases`}
          link={<Link to="/cases" className={kpiLink} aria-label="Money at stake: view open cases" />} />
        <KpiCard label="Critical" tone="danger" value={o ? String(o.critical.count) : "—"} sub={o && money(o.critical.dollars)}
          link={<Link to="/cases" search={{ priority: "Critical" }} className={kpiLink} aria-label="Critical: view critical cases" />} />
        <KpiCard label="Approvals needed, next 7 days" tone="warning" value={o ? String(o.approvalsNeeded.count) : "—"} sub={o && "Ready to file, due within 7 days"}
          link={<Link to="/cases" search={{ recommendation: "submit", maxDays: 7 }} className={kpiLink} aria-label="Approvals needed: view cases ready to file" />} />
        <KpiCard label="Packets submitted" tone="success" value={o ? String(o.packetsSubmitted.count) : "—"} sub={o && money(o.packetsSubmitted.dollars)}
          link={<Link to="/cases" hash="done" className={kpiLink} aria-label="Packets submitted: view done cases" />} />
      </div>

      {/* Row 2: needs attention + retailers. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="panel overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="section-title">Needs attention</h2>
            <Link to="/cases" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              View all <ArrowRight className="size-4" />
            </Link>
          </div>
          {o ? <AttentionTable rows={o.needsAttention} /> : <div className="px-5 pb-6 text-sm text-muted-foreground">{q.isPending ? "Loading…" : "—"}</div>}
        </section>

        <section className="space-y-4">
          <h2 className="section-title lg:pt-5">Retailers</h2>
          {o
            ? o.retailers.map((r) => <RetailerCard key={r.id} r={r} />)
            : <div className="panel p-5 text-sm text-muted-foreground">{q.isPending ? "Loading…" : "—"}</div>}
        </section>
      </div>

      {/* Row 3: after filing + closed without a decision. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="section-title">After filing</h2>
          <p className="mt-1 text-sm text-muted-foreground">Where submitted packets and write-offs stand.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Outcome label="Submitted" t={o?.afterFiling.submitted} />
            <Outcome label="Won" t={o?.afterFiling.won} dollarsLabel="recovered" tone="text-success" />
            <Outcome label="Denied" t={o?.afterFiling.denied} tone="text-destructive" />
            <Outcome label="Written off" t={o?.afterFiling.writtenOff} />
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="section-title">Closed without a decision</h2>
          <p className="mt-1 text-sm text-muted-foreground">The filing window closed or no attempts are left.</p>
          <ul className="mt-4 divide-y divide-border">
            {o?.closedWithoutDecision.map((r) => (
              <li key={r.deduction.id}>
                <Link to="/cases/$id" params={{ id: r.deduction.id }} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-secondary">
                  <div className="min-w-0 flex-1">
                    <div className="num text-sm font-medium text-primary">{r.deduction.id}</div>
                    <div className="truncate text-xs text-muted-foreground">{r.deduction.title}</div>
                  </div>
                  <span className="chip-neutral">{STATE_LABEL[r.result.state]}</span>
                  <span className="num w-24 text-right text-sm">{money(r.amount)}</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
            {o && o.closedWithoutDecision.length === 0 && <li className="py-4 text-sm text-muted-foreground">None yet</li>}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}

function summaryLine(critical: number, dueDollars: number) {
  if (critical === 0 && dueDollars === 0) return "Nothing critical and nothing due in the next 7 days.";
  return `${critical} critical ${critical === 1 ? "case" : "cases"} · ${money(dueDollars)} due within 7 days.`;
}

/* The link is stretched over the whole card, so the card is one click target. */
const kpiLink = "absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

function KpiCard({ label, value, sub, tone, link }: {
  label: string; value: string; sub?: string | null | undefined; tone?: "danger" | "warning" | "success"; link: ReactNode;
}) {
  const c = tone === "danger" ? "text-destructive" : tone === "warning" ? "text-warning-foreground" : tone === "success" ? "text-success" : "text-foreground";
  return (
    <div className="panel relative p-5 transition-shadow hover:shadow-md">
      {link}
      <div className="eyebrow">{label}</div>
      <div className={`num mt-3 kpi-num ${c}`}>{value}</div>
      <div className="mt-2 text-sm text-muted-foreground">{sub ?? " "}</div>
    </div>
  );
}

function AttentionTable({ rows }: { rows: QueueRow[] }) {
  const navigate = useNavigate();
  if (rows.length === 0) return <div className="px-5 pb-6 text-sm text-muted-foreground">No open cases. Nice.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-y border-border bg-secondary/40 text-left">
          <tr>
            <th className="px-5 py-2.5">Priority</th><th className="px-3 py-2.5">Case</th><th className="px-3 py-2.5">Retailer</th>
            <th className="px-3 py-2.5 text-right">Amount</th><th className="px-3 py-2.5">Days left</th><th className="px-5 py-2.5">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.deduction.id} onClick={() => navigate({ to: "/cases/$id", params: { id: r.deduction.id } })}
              className="cursor-pointer border-b border-border last:border-0 hover:bg-secondary/50">
              <td className="px-5 py-3">{r.result.priority && <span className={PRIORITY_CHIP[r.result.priority]}>{r.result.priority}</span>}</td>
              <td className="max-w-72 px-3 py-3">
                <Link to="/cases/$id" params={{ id: r.deduction.id }} onClick={(e) => e.stopPropagation()} className="num font-medium text-primary hover:underline">{r.deduction.id}</Link>
                <div className="truncate text-xs text-muted-foreground">{r.deduction.title}</div>
              </td>
              <td className="px-3 py-3">{RETAILER_NAMES[r.deduction.retailer_id] ?? r.deduction.retailer_id}</td>
              <td className="num px-3 py-3 text-right">{money(r.amount)}</td>
              <td className="num px-3 py-3">
                {r.result.days_left == null ? "—" : (
                  <>
                    <span className={r.result.days_left <= 7 ? "font-semibold text-destructive" : ""}>{r.result.days_left}d</span>
                    {r.result.clock && <div className="text-xs text-muted-foreground">{CLOCK_LABEL[r.result.clock]}</div>}
                  </>
                )}
              </td>
              <td className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="num"><ScoreCell r={r.result} /></span>
                  {r.result.band && <span className={BAND_CHIP[r.result.band]}>{r.result.band}</span>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RetailerCard({ r }: { r: ReturnType<typeof overview>["retailers"][number] }) {
  return (
    <Link to="/retailers/$retailerId" params={{ retailerId: r.id }} className="panel block p-5 transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">{r.name}</h3>
        <ChevronRight className="size-4 text-muted-foreground" />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Fact k="Open cases" v={String(r.openCases)} />
        <Fact k="At stake" v={money(r.openDollars)} />
        <Fact k="Critical" v={String(r.critical)} tone={r.critical ? "text-destructive" : undefined} />
        <Fact k="Ready to file" v={String(r.readyToSubmit)} />
      </dl>
      <div className="mt-4 rounded-xl bg-secondary px-3 py-2 text-sm">
        <span className="text-muted-foreground">Next deadline </span>
        {r.next ? (
          <>
            <span className={`num font-semibold ${r.next.result.days_left! <= 7 ? "text-destructive" : ""}`}>{r.next.result.days_left}d</span>
            <span className="text-muted-foreground"> · </span>
            <span className="num">{r.next.deduction.id}</span>
            {r.next.result.clock && <span className="text-muted-foreground"> · {CLOCK_LABEL[r.next.result.clock]}</span>}
          </>
        ) : <span className="text-muted-foreground">None</span>}
      </div>
    </Link>
  );
}

function Fact({ k, v, tone }: { k: string; v: string; tone?: string | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className={`num mt-0.5 font-semibold ${tone ?? ""}`}>{v}</dd>
    </div>
  );
}

function Outcome({ label, t, dollarsLabel, tone }: {
  label: string; t: { count: number; dollars: number } | undefined; dollarsLabel?: string; tone?: string;
}) {
  return (
    <div className="rounded-xl bg-secondary p-4">
      <div className="eyebrow">{label}</div>
      {!t ? <div className="mt-2 text-sm text-muted-foreground">—</div>
        : t.count === 0 ? <div className="mt-2 text-sm text-muted-foreground">None yet</div>
        : (
          <>
            <div className={`num mt-1 text-2xl font-semibold ${tone ?? ""}`}>{t.count}</div>
            <div className="num text-xs text-muted-foreground">{money(t.dollars)}{dollarsLabel ? ` ${dollarsLabel}` : ""}</div>
          </>
        )}
    </div>
  );
}
