import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { ArrowRight, Store } from "lucide-react";
import { AppShell, ProfileMenu } from "@/components/AppShell";
import { CaseSearch } from "@/components/CaseSearch";
import { KpiCard } from "@/components/KpiCard";
import { ScoreCell } from "@/components/QueueScreen";
import { Gauge, KpiSplit, StackedComparison, compactMoney, type Segment, type Slice } from "@/components/RetailerCharts";
import { useChargebacks } from "@/lib/chargebacks";
import { useCurrentUser } from "@/lib/current-user";
import { overview } from "@/lib/overview";
import {
  BANDS, BAND_CHIP, CLOCK_LABEL, PRIORITIES, PRIORITY_CHIP, RETAILER_NAMES, applyFilters, buildQueue, money, queueStats,
  type QueueRow,
} from "@/lib/queue";
import type { Band, Priority } from "@/lib/scoring";

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
type Totals = { count: number; dollars: number };

/**
 * Per-retailer view of the same numbers, for the Walmart vs Amazon comparisons. Built by running the existing
 * selectors (applyFilters, queueStats, overview) on each retailer's slice of buildQueue. Nothing is rescored.
 */
function byRetailer(q: Queue) {
  return Object.entries(RETAILER_NAMES).map(([id, name]) => {
    const slice = (rows: QueueRow[]) => applyFilters(rows, { retailer: id });
    const o = overview({ scorable: slice(q.scorable), notScorable: slice(q.notScorable), done: slice(q.done) });
    const group = (rows: QueueRow[]): Totals => ({ count: rows.length, dollars: queueStats(rows).openDollars });
    const bands = Object.fromEntries(BANDS.map((band) => [band, group(applyFilters(q.scorable, { retailer: id, band }))]));
    const priorities = Object.fromEntries(PRIORITIES.map((p) => [p, group(applyFilters(q.scorable, { retailer: id, priority: p }))]));
    return { id, name, o, bands, priorities };
  });
}
type RetailerSplit = ReturnType<typeof byRetailer>[number];

/** Soft segment colors (tokens in styles.css). Count text is white on the darker ones. */
const BAND_SEGMENTS: Segment[] = [
  { key: "Ready", label: "Ready", color: "var(--band-ready)", ink: "var(--primary-foreground)" },
  { key: "Needs work", label: "Needs work", color: "var(--band-needs-work)", ink: "var(--foreground)" },
  { key: "Weak", label: "Weak", color: "var(--band-weak)", ink: "var(--primary-foreground)" },
];
const PRIORITY_SEGMENTS: Segment[] = [
  { key: "Critical", label: "Critical", color: "var(--prio-critical)", ink: "var(--primary-foreground)" },
  { key: "High", label: "High", color: "var(--prio-high)", ink: "var(--foreground)" },
  { key: "Normal", label: "Normal", color: "var(--prio-normal)", ink: "var(--foreground)" },
  { key: "Low", label: "Low", color: "var(--prio-low)", ink: "var(--foreground)" },
];

function Home() {
  const q = useChargebacks();
  const { currentUser } = useCurrentUser();
  const firstName = currentUser?.name.split(" ")[0];
  const queue = q.data ? buildQueue(q.data.scored, q.data.queue) : null;
  const o = queue ? overview(queue) : null;
  const split = queue ? byRetailer(queue) : null;
  // Ready to file: open scored cases in the Ready band, out of all open scored cases.
  const ready = queue ? applyFilters(queue.scorable, { band: "Ready" }).length : 0;
  const openScored = queue?.scorable.length ?? 0;
  const loading = <Muted>{q.isPending ? "Loading…" : "—"}</Muted>;
  const kpi = (pick: (r: RetailerSplit) => Totals) => (split ? slices(split, pick) : undefined);

  return (
    <AppShell bare>
      {/* Header: greeting left; search and profile right. No top bar on this page. */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="min-w-0 truncate text-[28px] leading-tight font-semibold tracking-[-0.02em]">Good morning{firstName ? `, ${firstName}` : ""}</h1>
        <div className="flex min-w-0 items-center gap-3">
          <CaseSearch className="w-full sm:w-[360px]" />
          <ProfileMenu />
        </div>
      </header>

      {q.isError && (
        <div className="panel mt-6 border-l-4 border-l-destructive p-6 text-sm">
          <div className="font-medium text-destructive">Couldn't load the overview</div>
          <div className="mt-1 text-muted-foreground">{q.error.message}</div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-12 gap-6">
        {/* Row 1: four KPIs, one value each, with the Walmart / Amazon split under it. */}
        <Kpi label="Money at stake" link={{ to: "/cases" }}
          value={o ? compactMoney(o.open.dollars) : "—"} full={o ? money(o.open.dollars) : undefined}
          slices={kpi((r) => r.o.open)} empty="Nothing at stake" />
        <Kpi label="Critical" urgent link={{ to: "/cases", search: { priority: "Critical" } }}
          value={o ? String(o.critical.count) : "—"} full={o ? money(o.critical.dollars) : undefined}
          slices={kpi((r) => r.o.critical)} empty="No critical cases" />
        <Kpi label="Due in 7 days" link={{ to: "/cases", search: { recommendation: "submit", maxDays: 7 } }}
          value={o ? String(o.approvalsNeeded.count) : "—"} full={o ? `Ready to file, due in 7 days or less · ${money(o.approvalsNeeded.dollars)}` : undefined}
          slices={kpi((r) => r.o.approvalsNeeded)} empty="Nothing due in 7 days" />
        <Kpi label="Submitted" link={{ to: "/cases", hash: "done" }}
          value={o ? String(o.packetsSubmitted.count) : "—"} full={o ? money(o.packetsSubmitted.dollars) : undefined}
          slices={kpi((r) => r.o.packetsSubmitted)} empty="Nothing submitted yet" />

        {/* Row 2: the working row. */}
        <Card className="col-span-12 xl:col-span-8" title="Needs attention"
          link={<Link to="/cases" className={linkCls}>View all <ArrowRight className="size-3.5" /></Link>}>
          {queue ? <AttentionList rows={queue.scorable.slice(0, 6)} /> : loading}
        </Card>
        <div className="col-span-12 flex min-w-0 flex-col gap-6 xl:col-span-4">
          <Card title="Ready to file">
            {!queue ? loading : openScored === 0 ? <NoneYet /> : (
              <div className="flex items-center gap-5">
                <div className="w-full max-w-[140px] shrink-0">
                  <Gauge percent={(ready / openScored) * 100} label={`${ready} of ${openScored} open cases are Ready`} />
                </div>
                <div className="min-w-0">
                  <div className="num text-[28px] leading-none font-semibold tracking-[-0.02em]">{Math.round((ready / openScored) * 100)}%</div>
                  <div className="num mt-1.5 text-sm text-muted-foreground">{ready} of {openScored} open cases</div>
                </div>
              </div>
            )}
          </Card>
          <Card className="flex-1" title="Retailers">
            {split ? <RetailerRows split={split} /> : loading}
          </Card>
        </div>

        {/* Row 3: the comparison, and what happened after filing. */}
        <section className="panel col-span-12 flex min-w-0 flex-col p-6 xl:col-span-8">
          <CompareCard split={split} pending={q.isPending} />
        </section>
        <Card className="col-span-12 xl:col-span-4" title="After filing">
          <div className="grid h-full grid-cols-2 gap-3">
            <StatBlock label="Submitted" t={o?.afterFiling.submitted} />
            <StatBlock label="Won" t={o?.afterFiling.won} />
            <StatBlock label="Denied" t={o?.afterFiling.denied} />
            <StatBlock label="Written off" t={o?.afterFiling.writtenOff} />
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

/** One { count, dollars } total per retailer. */
const slices = (split: RetailerSplit[], pick: (r: RetailerSplit) => Totals): Slice[] =>
  split.map((r) => ({ id: r.id, name: r.name, ...pick(r) }));

/* ---------- Card anatomy ---------- */

function Card({ title, link, className = "", children }: { title: string; link?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`panel flex min-w-0 flex-col p-6 ${className}`}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="section-title truncate">{title}</h2>
        {link}
      </div>
      <div className="mt-3 min-w-0 flex-1">{children}</div>
    </section>
  );
}

type KpiLink = { to: "/cases"; search?: { priority?: "Critical"; recommendation?: "submit"; maxDays?: number }; hash?: string };

/** Shared 112px KPI card, with the label linking to its list and the Walmart / Amazon split bar (or a muted line at 0). */
function Kpi({ label, value, full, link, slices: s, empty, urgent = false }: {
  label: string; value: string; full?: string | undefined; link: KpiLink; slices: Slice[] | undefined; empty: string; urgent?: boolean;
}) {
  const total = s?.reduce((t, x) => t + x.count, 0) ?? 0;
  return (
    <KpiCard value={value} full={full} urgent={urgent}
      label={<Link {...link} className="truncate hover:text-foreground hover:underline focus-visible:underline focus-visible:outline-none">{label}</Link>}>
      {!s ? <span /> : total === 0 ? <p className="text-xs text-muted-foreground">{empty}</p> : <KpiSplit slices={s} />}
    </KpiCard>
  );
}

/** Small link in a card title row: sage, visible keyboard focus. */
const linkCls = "inline-flex shrink-0 items-center gap-1 rounded-md text-[13px] font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none";

const Muted = ({ children }: { children: ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;
const NoneYet = () => <Muted>None yet</Muted>;

/* ---------- Row 2 ---------- */

const ATTENTION_COLS = "grid grid-cols-[4.25rem_minmax(0,1fr)_4rem_5rem_6rem_6.75rem] items-center gap-x-3";

function AttentionList({ rows }: { rows: QueueRow[] }) {
  if (rows.length === 0) return <Muted>No open cases.</Muted>;
  return (
    <div className="-mx-2">
      <div className={`${ATTENTION_COLS} h-6 border-b border-border px-2 text-xs font-medium text-tertiary`}>
        <span>Priority</span><span>Case</span><span>Retailer</span>
        <span className="text-right">Amount</span><span>Days left</span><span>Score</span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const d = r.deduction;
          return (
            <li key={d.id}>
              <Link to="/cases/$id" params={{ id: d.id }}
                className={`${ATTENTION_COLS} h-[52px] rounded-lg px-2 text-sm hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none`}>
                <span>{r.result.priority && <span className={PRIORITY_CHIP[r.result.priority]}>{r.result.priority}</span>}</span>
                <span className="min-w-0">
                  <span className="num block truncate font-medium text-primary">{d.id}</span>
                  <span className="block truncate text-xs text-muted-foreground" title={d.title}>{d.title}</span>
                </span>
                <span className="truncate">{RETAILER_NAMES[d.retailer_id] ?? d.retailer_id}</span>
                <span className="num truncate text-right">{money(r.amount)}</span>
                <span className="num min-w-0">
                  {r.result.days_left == null ? "—" : (
                    <>
                      <span className={`block ${r.result.days_left <= 7 ? "font-semibold" : ""}`}>{r.result.days_left}d</span>
                      {r.result.clock && <span className="block truncate text-xs text-muted-foreground" title={CLOCK_LABEL[r.result.clock]}>{CLOCK_LABEL[r.result.clock]}</span>}
                    </>
                  )}
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="num"><ScoreCell r={r.result} /></span>
                  {r.result.band && <span className={`${BAND_CHIP[r.result.band]} shrink-0`}>{r.result.band}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RetailerRows({ split }: { split: RetailerSplit[] }) {
  return (
    // Rows spread over the card's height, which is set by the Needs attention card beside it.
    <ul className="flex h-full flex-col justify-around gap-3">
      {split.map((r) => (
        <li key={r.id} className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sand text-foreground" aria-hidden>
            <Store className="size-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{r.name}</div>
            <div className="num truncate text-xs text-muted-foreground" title={`${money(r.o.open.dollars)} at stake`}>
              {compactMoney(r.o.open.dollars)} at stake
            </div>
          </div>
          <Link to="/retailers/$retailerId" params={{ retailerId: r.id }} className={linkCls}>
            Open <ArrowRight className="size-3.5" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Row 3 ---------- */

type CompareBy = "readiness" | "priority";

function CompareCard({ split, pending }: { split: RetailerSplit[] | null; pending: boolean }) {
  const [by, setBy] = useState<CompareBy>("readiness");
  const total = split?.reduce((t, r) => t + r.o.open.count, 0) ?? 0;
  return (
    <>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="section-title truncate">Walmart vs Amazon</h2>
        <select aria-label="Compare by" value={by} onChange={(e) => setBy(e.target.value as CompareBy)}
          className="shrink-0 cursor-pointer rounded-full bg-secondary py-1.5 pr-8 pl-3 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
          <option value="readiness">By readiness</option>
          <option value="priority">By priority</option>
        </select>
      </div>
      <div className="mt-4 min-w-0">
        {!split ? <Muted>{pending ? "Loading…" : "—"}</Muted> : total === 0 ? <NoneYet /> : (
          <StackedComparison
            retailers={split.map((r) => ({ id: r.id, name: r.name }))}
            segments={by === "readiness" ? BAND_SEGMENTS : PRIORITY_SEGMENTS}
            values={Object.fromEntries(split.map((r) => [r.id, by === "readiness" ? r.bands : r.priorities]))}
            filter={(key) => (by === "readiness" ? { band: key as Band } : { priority: key as Priority })}
          />
        )}
      </div>
    </>
  );
}

function StatBlock({ label, t }: { label: string; t: Totals | undefined }) {
  const zero = !t || t.count === 0;
  return (
    <div className="flex min-w-0 flex-col justify-center rounded-2xl bg-secondary/60 px-4 py-3" title={t && t.count > 0 ? money(t.dollars) : undefined}>
      <div className={`num text-2xl leading-7 font-semibold ${zero ? "text-tertiary" : ""}`}>{t ? t.count : "—"}</div>
      <div className="truncate text-[13px] font-medium text-muted-foreground">{label}</div>
    </div>
  );
}
