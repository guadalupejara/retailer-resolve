// Walmart vs Amazon charts for the home dashboard. Every value passed in comes from the existing selectors
// (buildQueue, applyFilters, queueStats, overview); these components only draw them.
// Plain HTML bars: exact counts and dollars are in the hover (or keyboard focus) tooltip, and the
// comparison segments link to the retailer page with that filter set.
import { Link } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";
import { money, type QueueFilters } from "@/lib/queue";

/** One fixed color per retailer, used on every chart: the --walmart and --amazon tokens in styles.css. */
export const RETAILER_COLOR: Record<string, string> = { walmart: "var(--walmart)", amazon: "var(--amazon)" };
const colorOf = (id: string) => RETAILER_COLOR[id] ?? "var(--tertiary)";

export interface Slice { id: string; name: string; count: number; dollars: number }

const compactUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
/** Card form of a dollar figure ($56.4K). The full value goes in a title tooltip or a table. */
export const compactMoney = (n: number) => compactUsd.format(n);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/* ---------- Tooltip ---------- */

/** Shows `tip` above its child on hover or keyboard focus. Nothing is clipped: no overflow-hidden parents. */
function HoverTip({ tip, children, className = "", style }: { tip: ReactNode; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`group/tip relative ${className}`} style={style}>
      {children}
      <div role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-40 mb-2 -translate-x-1/2 rounded-xl bg-popover px-3 py-2 text-xs whitespace-nowrap text-foreground opacity-0 shadow-md ring-1 ring-border transition-opacity group-focus-within/tip:visible group-focus-within/tip:opacity-100 group-hover/tip:visible group-hover/tip:opacity-100">
        {tip}
      </div>
    </div>
  );
}

const Dot = ({ color }: { color: string }) => <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />;

/* ---------- KPI: Walmart share of one total ---------- */

/** 100%-wide, 6px split bar with name-only legend dots. Tooltip: "Walmart 4 cases · $13,660.00". */
export function KpiSplit({ slices }: { slices: Slice[] }) {
  const visible = slices.filter((s) => s.count > 0);
  const lines = slices.map((s) => `${s.name} ${plural(s.count, "case")} · ${money(s.dollars)}`);
  return (
    <div>
      <HoverTip tip={<div className="num space-y-0.5">{lines.map((l) => <div key={l}>{l}</div>)}</div>}>
        <div tabIndex={0} aria-label={lines.join("; ")} className="flex h-1.5 w-full gap-0.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2">
          {visible.map((s, i) => (
            <span key={s.id} className={`h-full min-w-1 ${i === 0 ? "rounded-l-full" : ""} ${i === visible.length - 1 ? "rounded-r-full" : ""}`}
              style={{ flexGrow: s.count, flexBasis: 0, backgroundColor: colorOf(s.id) }} />
          ))}
        </div>
      </HoverTip>
      <div className="mt-1.5 flex items-center gap-3 text-[11px] leading-3 text-tertiary">
        {slices.map((s) => <span key={s.id} className="inline-flex items-center gap-1"><Dot color={colorOf(s.id)} />{s.name}</span>)}
      </div>
    </div>
  );
}

/* ---------- Walmart vs Amazon: one 100% stacked bar per retailer ---------- */

export interface Segment {
  key: string;
  label: string;
  color: string;
  /** Count text inside the segment: white on dark colors, ink on light ones. */
  ink: string;
}

export function StackedComparison({ retailers, segments, values, filter }: {
  retailers: { id: string; name: string }[];
  segments: Segment[];
  /** values[retailerId][segmentKey] */
  values: Record<string, Record<string, { count: number; dollars: number }>>;
  /** The retailer-page search for a segment, e.g. { band: "Ready" }. */
  filter: (key: string) => Pick<QueueFilters, "band" | "priority">;
}) {
  return (
    <div>
      <div className="space-y-3">
        {retailers.map((r) => {
          const row = values[r.id] ?? {};
          const total = segments.reduce((t, s) => t + (row[s.key]?.count ?? 0), 0);
          const visible = segments.filter((s) => (row[s.key]?.count ?? 0) > 0);
          return (
            <div key={r.id} className="flex min-w-0 items-center gap-3">
              <span className="w-16 shrink-0 truncate text-sm font-medium">{r.name}</span>
              <div className="flex h-5 min-w-0 flex-1 gap-0.5">
                {total === 0 && <span className="h-full flex-1 rounded-full bg-secondary" />}
                {visible.map((s, i) => {
                  const v = row[s.key]!;
                  const pct = Math.round((v.count / total) * 100);
                  return (
                    <HoverTip key={s.key} className="h-full min-w-1.5" style={{ flexGrow: v.count, flexBasis: 0 }}
                      tip={<span className="num">{r.name} · {s.label}: {plural(v.count, "case")} · {money(v.dollars)} · {pct}% of {r.name}</span>}>
                      <Link to="/retailers/$retailerId" params={{ retailerId: r.id }} search={filter(s.key)}
                        aria-label={`${r.name} ${s.label}: ${plural(v.count, "case")}, ${money(v.dollars)}, ${pct}%`}
                        className={`num flex h-full items-center justify-center text-[11px] font-semibold outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 ${i === 0 ? "rounded-l-full" : ""} ${i === visible.length - 1 ? "rounded-r-full" : ""}`}
                        style={{ backgroundColor: s.color, color: s.ink }}>
                        {pct >= 8 ? v.count : ""}
                      </Link>
                    </HoverTip>
                  );
                })}
              </div>
              <span className="num w-16 shrink-0 text-right text-sm text-muted-foreground">{plural(total, "case")}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {segments.map((s) => <span key={s.key} className="inline-flex items-center gap-1.5"><Dot color={s.color} />{s.label}</span>)}
      </div>
    </div>
  );
}

/* ---------- Ready to file: semicircle gauge ---------- */

export function Gauge({ percent, label }: { percent: number; label: string }) {
  const value = Math.max(0, Math.min(100, percent));
  // A half ring drawn with pathLength=100, so the dash length is the percent. Scales with its box via viewBox.
  const arc = "M 18 100 A 82 82 0 0 1 182 100";
  return (
    <svg viewBox="0 0 200 112" className="block w-full" role="img" aria-label={label}>
      <path d={arc} fill="none" stroke="var(--primary-tint)" strokeWidth={22} strokeLinecap="round" />
      {value > 0 && (
        <path d={arc} fill="none" stroke="var(--primary)" strokeWidth={22} strokeLinecap="round" pathLength={100} strokeDasharray={`${value} 100`} />
      )}
    </svg>
  );
}
