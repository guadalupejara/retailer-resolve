import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { ArrowRight, Store } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CaseSearch } from "@/components/CaseSearch";
import {
  ComparisonChart, Gauge, MiniBars, MiniDonut, MiniSplit, RetailerLegendChips, compactMoney, type Slice,
} from "@/components/RetailerCharts";
import { useChargebacks } from "@/lib/chargebacks";
import { useCurrentUser } from "@/lib/current-user";
import { overview } from "@/lib/overview";
import {
  BANDS, BAND_CHIP, PRIORITIES, RETAILER_NAMES, applyFilters, buildQueue, money, queueStats, type QueueRow,
} from "@/lib/queue";
import type { Priority } from "@/lib/scoring";

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
    const priorities = Object.fromEntries(PRIORITIES.map((p) => [p, group(applyFilters(q.scorable, { retailer: id, priority: p as Priority }))]));
    return { id, name, o, bands, priorities };
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
  // Ready to file: open scored cases in the Ready band, out of all open scored cases.
  const ready = queue ? applyFilters(queue.scorable, { band: "Ready" }).length : 0;
  const openScored = queue?.scorable.length ?? 0;
  const loading = <Muted>{q.isPending ? "Loading…" : "—"}</Muted>;

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="min-w-0 text-[28px] leading-tight font-semibold tracking-[-0.02em]">Good morning{firstName ? `, ${firstName}` : ""}</h1>
        <CaseSearch className="w-full sm:w-[360px]" />
      </div>

      {q.isError && (
        <div className="panel mt-6 border-l-4 border-l-destructive p-6 text-sm">
          <div className="font-medium text-destructive">Couldn't load the overview</div>
          <div className="mt-1 text-muted-foreground">{q.error.message}</div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-12 gap-6">
        {/* Row 1: four compact KPIs. One figure each; the Walmart / Amazon split is in the mini chart's tooltip. */}
        <KpiCard label="Money at stake" to={{ to: "/cases" }}
          value={o ? compactMoney(o.open.dollars) : "—"} full={o ? money(o.open.dollars) : undefined}>
          {split && o && o.open.count > 0 && <MiniDonut title="Money at stake" slices={slices(split, (r) => r.o.open)} />}
        </KpiCard>
        <KpiCard label="Critical" filled to={{ to: "/cases", search: { priority: "Critical" } }}
          value={o ? String(o.critical.count) : "—"} full={o ? `${o.critical.count} critical · ${money(o.critical.dollars)}` : undefined}>
          {split && o && o.critical.count > 0 && <MiniBars inverted title="Critical" slices={slices(split, (r) => r.o.critical)} />}
        </KpiCard>
        <KpiCard label="Approvals needed, next 7 days" to={{ to: "/cases", search: { recommendation: "submit", maxDays: 7 } }}
          value={o ? String(o.approvalsNeeded.count) : "—"} full={o ? `${o.approvalsNeeded.count} to approve · ${money(o.approvalsNeeded.dollars)}` : undefined}>
          {split && o && o.approvalsNeeded.count > 0 && <MiniBars title="Approvals needed, next 7 days" slices={slices(split, (r) => r.o.approvalsNeeded)} />}
        </KpiCard>
        <KpiCard label="Packets submitted" to={{ to: "/cases", hash: "done" }}
          value={o ? (o.packetsSubmitted.count === 0 ? "None yet" : String(o.packetsSubmitted.count)) : "—"}
          full={o ? `${o.packetsSubmitted.count} submitted · ${money(o.packetsSubmitted.dollars)}` : undefined}>
          {split && o && o.packetsSubmitted.count > 0 && <MiniSplit title="Packets submitted" slices={slices(split, (r) => r.o.packetsSubmitted)} />}
        </KpiCard>

        {/* Row 2: the comparison, the readiness gauge, the retailers. */}
        <section className="panel col-span-12 flex min-w-0 flex-col p-6 xl:col-span-6">
          <CompareCard split={split} pending={q.isPending} />
        </section>
        <Card className="col-span-12 md:col-span-6 xl:col-span-3" title="Ready to file">
          {!queue ? loading : openScored === 0 ? <NoneYet /> : (
            <div className="flex h-full flex-col justify-center">
              <Gauge percent={(ready / openScored) * 100} label={`${ready} of ${openScored} open cases are Ready`} />
              <p className="num mt-3 text-center text-sm text-muted-foreground">{ready} of {openScored} open cases</p>
            </div>
          )}
        </Card>
        <Card className="col-span-12 md:col-span-6 xl:col-span-3" title="Retailers">
          {split ? <RetailerRows split={split} /> : loading}
        </Card>

        {/* Row 3: the work, and what happened after filing. */}
        <Card className="col-span-12 xl:col-span-8" title="Needs attention"
          link={<Link to="/cases" className={linkCls}>View all <ArrowRight className="size-3.5" /></Link>}>
          {o ? <AttentionList rows={o.needsAttention} /> : loading}
        </Card>
        <Card className="col-span-12 xl:col-span-4" title="After filing">
          <div className="grid grid-cols-2 gap-3">
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

/** One { count, dollars } total per retailer, in chart form. */
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
      <div className="mt-4 min-w-0 flex-1">{children}</div>
    </section>
  );
}

type KpiLink =
  | { to: "/cases"; search?: { priority?: "Critical"; recommendation?: "submit"; maxDays?: number }; hash?: string };

/** Compact KPI: label and one value on the left, a mini chart on the right. The whole label is a link to the list. */
function KpiCard({ label, value, full, to, filled = false, children }: {
  label: string; value: string; full?: string | undefined; to: KpiLink; filled?: boolean; children?: ReactNode;
}) {
  return (
    <section className={`panel col-span-12 flex min-h-24 min-w-0 items-center gap-3 px-5 py-4 sm:col-span-6 xl:col-span-3 ${filled ? "!bg-primary-dark text-primary-foreground" : ""}`}>
      <div className="min-w-0 flex-1">
        <Link {...to} className={`block text-[13px] leading-snug font-medium hover:underline focus-visible:underline focus-visible:outline-none ${filled ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
          {label}
        </Link>
        <div className="num mt-1.5 truncate text-[26px] leading-none font-semibold tracking-[-0.02em]" title={full}>{value}</div>
      </div>
      {children}
    </section>
  );
}

/** Small link in a card title row: sage, visible keyboard focus. */
const linkCls = "inline-flex shrink-0 items-center gap-1 rounded-md text-[13px] font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none";

const Muted = ({ children }: { children: ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;
const NoneYet = () => <Muted>None yet</Muted>;

/* ---------- Row 2 ---------- */

type CompareBy = "readiness" | "priority";

function CompareCard({ split, pending }: { split: RetailerSplit[] | null; pending: boolean }) {
  const [by, setBy] = useState<CompareBy>("readiness");
  const groups: string[] = by === "readiness" ? BANDS : PRIORITIES;
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
      {split && <div className="mt-3"><RetailerLegendChips retailers={split} /></div>}
      <div className="mt-4 h-56 min-w-0">
        {!split ? <Muted>{pending ? "Loading…" : "—"}</Muted> : total === 0 ? <NoneYet /> : (
          <ComparisonChart
            retailers={split.map((r) => ({ id: r.id, name: r.name }))}
            rows={groups.map((g) => ({
              group: g,
              byRetailer: Object.fromEntries(split.map((r) => [r.id, (by === "readiness" ? r.bands : r.priorities)[g] ?? { count: 0, dollars: 0 }])),
            }))}
          />
        )}
      </div>
    </>
  );
}

function RetailerRows({ split }: { split: RetailerSplit[] }) {
  return (
    <ul className="space-y-3">
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

/** Left edge of each Needs attention row, by priority. */
const PRIORITY_BAR: Record<string, string> = {
  Critical: "bg-destructive",
  High: "bg-warning",
  Normal: "bg-tertiary",
  Low: "bg-tertiary",
};

function AttentionList({ rows }: { rows: QueueRow[] }) {
  if (rows.length === 0) return <Muted>No open cases.</Muted>;
  return (
    <ul className="-mx-2 space-y-1">
      {rows.map((r) => {
        const d = r.deduction;
        const retailer = RETAILER_NAMES[d.retailer_id] ?? d.retailer_id;
        const days = r.result.days_left == null ? "No active clock" : `${r.result.days_left} ${r.result.days_left === 1 ? "day" : "days"} left`;
        return (
          <li key={d.id}>
            <Link to="/cases/$id" params={{ id: d.id }}
              className="group flex min-w-0 items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-secondary/70 focus-visible:bg-secondary/70 focus-visible:outline-none">
              <span className={`h-9 w-1 shrink-0 rounded-full ${r.result.priority ? PRIORITY_BAR[r.result.priority] : "bg-tertiary"}`}
                title={r.result.priority ? `${r.result.priority} priority` : undefined} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm" title={`${d.id} · ${d.title}`}>
                  <span className="num font-medium">{d.id}</span>
                  <span className="text-muted-foreground"> · {d.title}</span>
                </span>
                <span className="num block truncate text-xs text-tertiary">
                  {r.result.priority && <span className="sr-only">{r.result.priority} priority · </span>}{retailer} · {days}
                </span>
              </span>
              {/* Amount and score only on hover or keyboard focus. */}
              <span className="num hidden shrink-0 text-xs whitespace-nowrap text-muted-foreground group-hover:inline group-focus-visible:inline">
                {money(r.amount)}{r.result.display != null ? ` · score ${r.result.display}` : ""}
              </span>
              {r.result.band && <span className={`${BAND_CHIP[r.result.band]} shrink-0`}>{r.result.band}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function StatBlock({ label, t }: { label: string; t: Totals | undefined }) {
  return (
    <div className="min-w-0 rounded-2xl bg-secondary/60 p-4" title={t && t.count > 0 ? money(t.dollars) : undefined}>
      <div className="truncate text-[13px] font-medium text-muted-foreground">{label}</div>
      {!t ? <div className="mt-2 text-sm text-muted-foreground">—</div>
        : t.count === 0 ? <div className="mt-2 text-sm text-muted-foreground">None yet</div>
        : <div className="num mt-1 text-2xl font-semibold">{t.count}</div>}
    </div>
  );
}
