// Walmart vs Amazon charts for the home dashboard. Every value passed in comes from the existing selectors
// (buildQueue, applyFilters, queueStats, overview); these components only draw them.
// No numbers are printed on the charts: exact counts and dollars are in the hover tooltip, and every chart
// is clickable (a bar or slice opens that retailer's page).
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money } from "@/lib/queue";

/** One fixed color per retailer, used on every chart: the --walmart and --amazon tokens in styles.css. */
export const RETAILER_COLOR: Record<string, string> = { walmart: "var(--walmart)", amazon: "var(--amazon)" };
/** On the filled dark-sage card, Walmart's dark sage would vanish, so it turns white there. */
const INVERTED_COLOR: Record<string, string> = { walmart: "var(--primary-foreground)", amazon: "var(--amazon)" };
const colorOf = (id: string, inverted = false) => (inverted ? INVERTED_COLOR : RETAILER_COLOR)[id] ?? "var(--tertiary)";

const SURFACE = "var(--card)";
const INK_MUTED = "var(--muted-foreground)";
const HOVER_FILL = "var(--secondary)";

export interface Slice { id: string; name: string; count: number; dollars: number }

const compactUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
/** Card form of a dollar figure ($56.4K). The full value goes in a title tooltip or a table. */
export const compactMoney = (n: number) => compactUsd.format(n);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function useOpenRetailer() {
  const navigate = useNavigate();
  return (id: string) => navigate({ to: "/retailers/$retailerId", params: { retailerId: id } });
}

/* ---------- Tooltips ---------- */

function TipBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-popover px-3 py-2 text-xs whitespace-nowrap text-foreground shadow-md ring-1 ring-border">
      <div className="font-medium">{title}</div>
      <div className="num mt-1 space-y-0.5 text-muted-foreground">{children}</div>
    </div>
  );
}

/** Both retailers, count and dollars. Used by every mini chart. */
function BothTip({ title, slices, word = "case" }: { title: string; slices: Slice[]; word?: string }) {
  return (
    <TipBox title={title}>
      {slices.map((s) => (
        <div key={s.id} className="flex items-center gap-2">
          <span className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: colorOf(s.id) }} aria-hidden />
          <span className="text-foreground">{s.name}</span>
          <span>{plural(s.count, word)} · {money(s.dollars)}</span>
        </div>
      ))}
    </TipBox>
  );
}

const tipProps = { wrapperStyle: { zIndex: 40, outline: "none" }, allowEscapeViewBox: { x: true, y: true }, isAnimationActive: false } as const;

/* ---------- KPI mini charts (fit a 64 x 56 box) ---------- */

export function MiniDonut({ slices, title, inverted = false }: { slices: Slice[]; title: string; inverted?: boolean }) {
  const open = useOpenRetailer();
  return (
    <div className="h-14 w-14 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart accessibilityLayer>
          <Pie data={slices} dataKey="dollars" nameKey="name" innerRadius={16} outerRadius={27} paddingAngle={3}
            startAngle={90} endAngle={-270} stroke={inverted ? "transparent" : SURFACE} strokeWidth={2} isAnimationActive={false}
            onClick={(d: { payload?: Slice }) => d.payload && open(d.payload.id)} className="cursor-pointer">
            {slices.map((s) => <Cell key={s.id} fill={colorOf(s.id, inverted)} />)}
          </Pie>
          <Tooltip {...tipProps} content={({ active }) => (active ? <BothTip title={title} slices={slices} /> : null)} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MiniBars({ slices, title, inverted = false }: { slices: Slice[]; title: string; inverted?: boolean }) {
  const open = useOpenRetailer();
  const max = Math.max(1, ...slices.map((s) => s.count));
  return (
    <div className="h-14 w-16 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={slices} margin={{ top: 2, right: 8, bottom: 0, left: 8 }} barCategoryGap="30%" accessibilityLayer>
          <XAxis dataKey="name" hide />
          <YAxis hide domain={[0, max]} />
          <Tooltip {...tipProps} cursor={false} content={({ active }) => (active ? <BothTip title={title} slices={slices} /> : null)} />
          <Bar dataKey="count" barSize={8} radius={[4, 4, 0, 0]} minPointSize={3} isAnimationActive={false}
            onClick={(d: { payload?: Slice }) => d.payload && open(d.payload.id)} className="cursor-pointer">
            {slices.map((s) => <Cell key={s.id} fill={colorOf(s.id, inverted)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MiniSplit({ slices, title, inverted = false }: { slices: Slice[]; title: string; inverted?: boolean }) {
  const open = useOpenRetailer();
  const total = slices.reduce((t, s) => t + s.count, 0);
  const row = Object.fromEntries(slices.map((s) => [s.id, s.count]));
  const visible = slices.filter((s) => s.count > 0);
  return (
    <div className="flex h-14 w-20 shrink-0 items-center">
      <div className="h-3 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={[row]} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }} accessibilityLayer>
            <XAxis type="number" hide domain={[0, total]} />
            <YAxis type="category" hide />
            <Tooltip {...tipProps} cursor={false} content={({ active }) => (active ? <BothTip title={title} slices={slices} word="packet" /> : null)} />
            {visible.map((s, i) => (
              <Bar key={s.id} dataKey={s.id} name={s.name} stackId="split" fill={colorOf(s.id, inverted)}
                stroke={inverted ? "transparent" : SURFACE} strokeWidth={2} barSize={12} isAnimationActive={false}
                onClick={() => open(s.id)} className="cursor-pointer"
                radius={visible.length === 1 ? 6 : i === 0 ? [6, 0, 0, 6] : [0, 6, 6, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------- Walmart vs Amazon: grouped bars by readiness band or priority ---------- */

export function RetailerLegendChips({ retailers }: { retailers: { id: string; name: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-2">
      {retailers.map((r) => (
        <li key={r.id} className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
          <span className="size-2 rounded-full" style={{ backgroundColor: colorOf(r.id) }} aria-hidden />
          {r.name}
        </li>
      ))}
    </ul>
  );
}

export function ComparisonChart({ rows, retailers }: {
  rows: { group: string; byRetailer: Record<string, { count: number; dollars: number }> }[];
  retailers: { id: string; name: string }[];
}) {
  const open = useOpenRetailer();
  const data = rows.map((r) => ({ group: r.group, ...Object.fromEntries(retailers.map((x) => [x.id, r.byRetailer[x.id]?.count ?? 0])) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} barGap={4} barCategoryGap="30%" accessibilityLayer>
        <XAxis dataKey="group" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: INK_MUTED }} interval={0} />
        <YAxis hide allowDecimals={false} />
        <Tooltip {...tipProps} cursor={{ fill: HOVER_FILL, radius: 8 }} content={({ active, label }) => {
          const row = active ? rows.find((r) => r.group === label) : undefined;
          if (!row) return null;
          return (
            <BothTip title={String(label)}
              slices={retailers.map((x) => ({ id: x.id, name: x.name, count: row.byRetailer[x.id]?.count ?? 0, dollars: row.byRetailer[x.id]?.dollars ?? 0 }))} />
          );
        }} />
        {retailers.map((x) => (
          <Bar key={x.id} dataKey={x.id} name={x.name} fill={colorOf(x.id)} barSize={14} radius={[6, 6, 6, 6]} minPointSize={2}
            isAnimationActive={false} onClick={() => open(x.id)} className="cursor-pointer" />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ---------- Ready to file: semicircle gauge ---------- */

export function Gauge({ percent, label }: { percent: number; label: string }) {
  const value = Math.max(0, Math.min(100, percent));
  // A half ring drawn with pathLength=100, so the dash length is the percent. Scales with its card via viewBox.
  const arc = "M 18 100 A 82 82 0 0 1 182 100";
  return (
    <div className="relative mx-auto w-full max-w-[200px]" role="img" aria-label={label}>
      <svg viewBox="0 0 200 112" className="block w-full" aria-hidden>
        <path d={arc} fill="none" stroke="var(--primary-tint)" strokeWidth={20} strokeLinecap="round" />
        {value > 0 && (
          <path d={arc} fill="none" stroke="var(--primary)" strokeWidth={20} strokeLinecap="round" pathLength={100} strokeDasharray={`${value} 100`} />
        )}
      </svg>
      <div className="num pointer-events-none absolute inset-x-0 bottom-1 text-center text-[26px] leading-none font-semibold">{Math.round(value)}%</div>
    </div>
  );
}
