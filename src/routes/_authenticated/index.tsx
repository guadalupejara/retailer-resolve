import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";
import { AlertTriangle, ArrowRight, ClipboardCheck, Send, Wallet } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CaseSearch } from "@/components/CaseSearch";
import { ScoreCell } from "@/components/QueueScreen";
import { RETAILER_COLOR, ReadinessChart, RetailerBars, RetailerDonut, RetailerSplitBar, type Slice } from "@/components/RetailerCharts";
import { useChargebacks } from "@/lib/chargebacks";
import { useCurrentUser } from "@/lib/current-user";
import { overview } from "@/lib/overview";
import {
  BANDS, BAND_CHIP, CLOCK_LABEL, PRIORITY_CHIP, RETAILER_NAMES, STATE_LABEL,
  applyFilters, buildQueue, money, queueStats, type QueueRow,
} from "@/lib/queue";

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

type Queue = ReturnType<typeof buildQueue>;

/**
 * Per-retailer view of the same numbers, for the Walmart vs Amazon comparisons. Built by running the existing
 * selectors (applyFilters, queueStats, overview) on each retailer's slice of buildQueue. Nothing is rescored.
 */
function byRetailer(q: Queue) {
  return Object.entries(RETAILER_NAMES).map(([id, name]) => {
    const slice = (rows: QueueRow[]) => applyFilters(rows, { retailer: id });
    const o = overview({ scorable: slice(q.scorable), notScorable: slice(q.notScorable), done: slice(q.done) });
    const bands = BANDS.map((band) => {
      const rows = applyFilters(q.scorable, { retailer: id, band });
      return { band, count: rows.length, dollars: queueStats(rows).openDollars };
    });
    return { id, name, o, bands };
  });
}
type RetailerSplit = ReturnType<typeof byRetailer>[number];

function Home() {
  const q = useChargebacks();
  const { currentUser } = useCurrentUser();
  const firstName = currentUser?.name.split(" ")[0];
  const queue = q.data ? buildQueue(q.data.scored, q.data.queue) : null;
  const o = queue ? overview(queue) : null;
  const split = queue ? byRetailer(queue) : null;

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="page-title">Good morning{firstName ? `, ${firstName}` : ""}</h1>
        <CaseSearch className="w-full sm:w-[420px]" />
      </div>

      {q.isError && (
        <div className="panel mt-6 border-l-4 border-l-destructive p-6 text-sm">
          <div className="font-medium text-destructive">Couldn't load the overview</div>
          <div className="mt-1 text-muted-foreground">{q.error.message}</div>
        </div>
      )}

      <div className="mt-8 grid grid-cols-12 gap-6">
        {/* Row 1: KPIs. Each compares Walmart and Amazon. */}
        <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-3" icon={Wallet} label="Money at stake"
          value={o ? money(o.open.dollars) : "—"}
          link={<Link to="/cases" className={linkCls}>View <ArrowRight className="size-3.5" /></Link>}>
          {split && o && (o.open.count === 0 ? <NoneYet /> : <RetailerDonut slices={slices(split, (r) => r.o.open)} total={o.open.dollars} />)}
        </KpiCard>
        <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-3" icon={AlertTriangle} label="Critical"
          value={o ? String(o.critical.count) : "—"}
          link={<Link to="/cases" search={{ priority: "Critical" }} className={linkCls}>View <ArrowRight className="size-3.5" /></Link>}>
          {split && o && (o.critical.count === 0 ? <NoneYet /> :
            <RetailerBars slices={slices(split, (r) => r.o.critical)} />)}
        </KpiCard>
        <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-3" icon={ClipboardCheck} label="Approvals needed, next 7 days"
          value={o ? String(o.approvalsNeeded.count) : "—"}
          link={<Link to="/cases" search={{ recommendation: "submit", maxDays: 7 }} className={linkCls}>View <ArrowRight className="size-3.5" /></Link>}>
          {split && o && (o.approvalsNeeded.count === 0 ? <NoneYet /> :
            <RetailerBars slices={slices(split, (r) => r.o.approvalsNeeded)} />)}
        </KpiCard>
        <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-3" icon={Send} label="Packets submitted"
          value={o ? String(o.packetsSubmitted.count) : "—"}
          link={<Link to="/cases" hash="done" className={linkCls}>View <ArrowRight className="size-3.5" /></Link>}>
          {split && o && (o.packetsSubmitted.count === 0 ? <NoneYet /> :
            <RetailerSplitBar slices={slices(split, (r) => r.o.packetsSubmitted)} />)}
        </KpiCard>

        {/* Row 2: the work, and the retailer comparison. */}
        <Card className="col-span-12 xl:col-span-8" title="Needs attention" link={<Link to="/cases" className={linkCls}>View all <ArrowRight className="size-3.5" /></Link>}>
          {o ? <AttentionList rows={o.needsAttention} /> : <Muted>{q.isPending ? "Loading…" : "—"}</Muted>}
        </Card>
        <Card className="col-span-12 xl:col-span-4" title="Retailers">
          {split ? <RetailerRows split={split} /> : <Muted>{q.isPending ? "Loading…" : "—"}</Muted>}
        </Card>

        {/* Row 3: what happened after filing. */}
        <Card className="col-span-12 lg:col-span-6" title="After filing">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatBlock label="Submitted" t={o?.afterFiling.submitted} />
            <StatBlock label="Won" t={o?.afterFiling.won} dollarsSuffix="recovered" />
            <StatBlock label="Denied" t={o?.afterFiling.denied} />
            <StatBlock label="Written off" t={o?.afterFiling.writtenOff} />
          </div>
        </Card>
        <Card className="col-span-12 lg:col-span-6" title="Closed without a decision">
          {o ? <ClosedList rows={o.closedWithoutDecision} /> : <Muted>{q.isPending ? "Loading…" : "—"}</Muted>}
        </Card>
      </div>
    </AppShell>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One { count, dollars } total per retailer, in chart form. */
const slices = (split: RetailerSplit[], pick: (r: RetailerSplit) => { count: number; dollars: number }): Slice[] =>
  split.map((r) => ({ id: r.id, name: r.name, ...pick(r) }));

/* ---------- Card anatomy: title row (title left, optional link right), then content ---------- */

function Card({ title, link, className = "", children }: { title: string; link?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`panel flex flex-col p-6 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title">{title}</h2>
        {link}
      </div>
      <div className="mt-4 flex-1">{children}</div>
    </section>
  );
}

type Icon = ComponentType<{ className?: string }>;

function KpiCard({ icon: I, label, value, link, className = "", children }: {
  icon: Icon; label: string; value: string; link: ReactNode; className?: string; children?: ReactNode;
}) {
  return (
    <section className={`panel flex flex-col p-6 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-sans text-[13px] font-medium tracking-normal text-muted-foreground">
          <span className="grid size-7 place-items-center rounded-lg border border-border text-foreground"><I className="size-3.5" /></span>
          {label}
        </h2>
        {link}
      </div>
      <div className="num kpi-num mt-4">{value}</div>
      <div className="mt-4 flex-1">{children}</div>
    </section>
  );
}

/** Small link in a card title row: accent color, visible keyboard focus. */
const linkCls = "inline-flex shrink-0 items-center gap-1 rounded-md text-[13px] font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none";

const Muted = ({ children }: { children: ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;
const NoneYet = () => <Muted>None yet</Muted>;

/* ---------- Row 2 ---------- */

const ATTENTION_COLS = "grid grid-cols-[5.5rem_minmax(0,1fr)_5rem_6rem_5.5rem_8.5rem] items-center gap-x-4";

function AttentionList({ rows }: { rows: QueueRow[] }) {
  if (rows.length === 0) return <Muted>No open cases.</Muted>;
  return (
    <div className="-mx-2 overflow-x-auto">
      <div className="min-w-[40rem]">
        <div className={`${ATTENTION_COLS} border-b border-border px-2 pb-2 text-xs font-medium text-muted-foreground`}>
          <span>Priority</span><span>Case</span><span>Retailer</span>
          <span className="text-right">Amount</span><span className="text-right">Days left</span><span className="text-right">Score</span>
        </div>
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.deduction.id}>
              <Link to="/cases/$id" params={{ id: r.deduction.id }}
                className={`${ATTENTION_COLS} rounded-lg px-2 py-3 text-sm hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none`}>
                <span>{r.result.priority && <span className={PRIORITY_CHIP[r.result.priority]}>{r.result.priority}</span>}</span>
                <span className="min-w-0">
                  <span className="num block font-medium text-primary">{r.deduction.id}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.deduction.title}</span>
                </span>
                <span>{RETAILER_NAMES[r.deduction.retailer_id] ?? r.deduction.retailer_id}</span>
                <span className="num text-right">{money(r.amount)}</span>
                <span className="num text-right">
                  {r.result.days_left == null ? "—" : (
                    <>
                      <span className={`block ${r.result.days_left <= 7 ? "font-semibold" : ""}`}>{r.result.days_left}d</span>
                      {r.result.clock && <span className="block text-xs text-muted-foreground">{CLOCK_LABEL[r.result.clock]}</span>}
                    </>
                  )}
                </span>
                <span className="flex items-center justify-end gap-2">
                  <span className="num"><ScoreCell r={r.result} /></span>
                  {r.result.band && <span className={BAND_CHIP[r.result.band]}>{r.result.band}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RetailerRows({ split }: { split: RetailerSplit[] }) {
  const total = split.reduce((t, r) => t + r.o.open.count, 0);
  return (
    <div className="flex h-full flex-col">
      <div className="text-[13px] font-medium text-muted-foreground">Walmart vs Amazon by readiness</div>
      {total === 0 ? <div className="mt-2"><NoneYet /></div> : (
        <div className="mt-2">
          <ReadinessChart
            retailers={split.map((r) => ({ id: r.id, name: r.name }))}
            rows={BANDS.map((band) => ({
              band,
              byRetailer: Object.fromEntries(split.map((r) => {
                const b = r.bands.find((x) => x.band === band);
                return [r.id, { count: b?.count ?? 0, dollars: b?.dollars ?? 0 }];
              })),
            }))}
          />
        </div>
      )}
      <ul className="mt-auto divide-y divide-border border-t border-border pt-1">
        {split.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2.5 last:pb-0">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: RETAILER_COLOR[r.id] }} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{r.name}</div>
              <div className="num text-xs text-muted-foreground">{plural(r.o.open.count, "open case")} · {money(r.o.open.dollars)}</div>
            </div>
            <Link to="/retailers/$retailerId" params={{ retailerId: r.id }} className={linkCls}>
              Open <ArrowRight className="size-3.5" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Row 3 ---------- */

function StatBlock({ label, t, dollarsSuffix }: { label: string; t: { count: number; dollars: number } | undefined; dollarsSuffix?: string }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="text-[13px] font-medium text-muted-foreground">{label}</div>
      {!t ? <div className="mt-2 text-sm text-muted-foreground">—</div>
        : t.count === 0 ? <div className="mt-2 text-sm text-muted-foreground">None yet</div>
        : (
          <>
            <div className="num mt-1 text-2xl font-semibold">{t.count}</div>
            <div className="num text-xs text-muted-foreground">{money(t.dollars)}{dollarsSuffix ? ` ${dollarsSuffix}` : ""}</div>
          </>
        )}
    </div>
  );
}

function ClosedList({ rows }: { rows: QueueRow[] }) {
  if (rows.length === 0) return <NoneYet />;
  return (
    <ul className="-mx-2 divide-y divide-border">
      {rows.map((r) => (
        <li key={r.deduction.id}>
          <Link to="/cases/$id" params={{ id: r.deduction.id }}
            className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none">
            <span className="min-w-0 flex-1">
              <span className="num block font-medium text-primary">{r.deduction.id}</span>
              <span className="block truncate text-xs text-muted-foreground">{r.deduction.title}</span>
            </span>
            <span className="chip-neutral">{STATE_LABEL[r.result.state]}</span>
            <span className="num w-24 text-right">{money(r.amount)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
