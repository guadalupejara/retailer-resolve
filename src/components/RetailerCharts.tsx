// Walmart vs Amazon charts for the home dashboard. Every value passed in comes from the existing selectors
// (buildQueue, applyFilters, queueStats, overview); these components only draw them.
// Identity is never color alone: each chart has direct labels or a legend with the retailer name and value,
// a hover tooltip with exact counts and dollars, and a click (or the linked legend) that opens the retailer page.
import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  Bar, BarChart, Cell, LabelList, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { money } from "@/lib/queue";

/**
 * One fixed color per retailer, used on every chart. Categorical slots 1 and 5 of the dataviz reference
 * palette; validated as a pair (CVD separation, normal-vision floor, 3:1 contrast on white all pass).
 * Neither is a status color or the brand accent.
 */
export const RETAILER_COLOR: Record<string, string> = { walmart: "#2a78d6", amazon: "#d55181" };
const colorOf = (id: string) => RETAILER_COLOR[id] ?? "#8a8f98";

const SURFACE = "#ffffff";
const INK_MUTED = "oklch(0.52 0.015 260)";

export interface Slice { id: string; name: string; count: number; dollars: number }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function useOpenRetailer() {
  const navigate = useNavigate();
  return (id: string) => navigate({ to: "/retailers/$retailerId", params: { retailerId: id } });
}

/* ---------- Shared pieces ---------- */

function TipBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-medium text-foreground">{title}</div>
      <div className="num mt-0.5 text-muted-foreground">{children}</div>
    </div>
  );
}

function SliceTip({ active, payload, word = "case" }: { active?: boolean; payload?: { payload: Slice }[]; word?: string }) {
  const s = active ? payload?.[0]?.payload : undefined;
  if (!s) return null;
  return <TipBox title={s.name}>{plural(s.count, word)} · {money(s.dollars)}</TipBox>;
}

function Swatch({ id }: { id: string }) {
  return <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: colorOf(id) }} aria-hidden />;
}

/** Legend that doubles as the keyboard path: each row is a focusable link to the retailer page. */
export function RetailerLegend({ slices, primary, secondary }: {
  slices: Slice[]; primary: (s: Slice) => string; secondary: (s: Slice) => string;
}) {
  return (
    <ul className="space-y-1.5">
      {slices.map((s) => (
        <li key={s.id}>
          <Link to="/retailers/$retailerId" params={{ retailerId: s.id }}
            className="flex items-center gap-2 rounded-md text-sm hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none">
            <Swatch id={s.id} />
            <span className="flex-1">{s.name}</span>
            <span className="num font-medium">{primary(s)}</span>
            <span className="num w-20 text-right text-muted-foreground">{secondary(s)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Money at stake: donut ---------- */

const compactUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });

export function RetailerDonut({ slices, total }: { slices: Slice[]; total: number }) {
  const open = useOpenRetailer();
  return (
    <div className="flex items-center gap-4">
      <div className="relative size-[112px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer>
            <Pie data={slices} dataKey="dollars" nameKey="name" innerRadius={38} outerRadius={54} paddingAngle={2}
              startAngle={90} endAngle={-270} stroke={SURFACE} strokeWidth={2} isAnimationActive={false}
              onClick={(d: { payload?: Slice }) => d.payload && open(d.payload.id)} className="cursor-pointer">
              {slices.map((s) => <Cell key={s.id} fill={colorOf(s.id)} />)}
            </Pie>
            <Tooltip content={<SliceTip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="num text-sm font-semibold">{compactUsd.format(total)}</span>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <RetailerLegend slices={slices} primary={(s) => money(s.dollars)} secondary={(s) => plural(s.count, "case")} />
      </div>
    </div>
  );
}

/* ---------- Critical / approvals: two horizontal bars ---------- */

export function RetailerBars({ slices }: { slices: Slice[] }) {
  const open = useOpenRetailer();
  const max = Math.max(1, ...slices.map((s) => s.count));
  return (
    <div>
      <ResponsiveContainer width="100%" height={slices.length * 34}>
        <BarChart data={slices} layout="vertical" margin={{ top: 0, right: 4, bottom: 0, left: 0 }} barCategoryGap={8} accessibilityLayer>
          {/* Extra room past the longest bar for its label. */}
          <XAxis type="number" hide domain={[0, max * 2.2]} allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={64} axisLine={false} tickLine={false}
            tick={{ fontSize: 13, fill: INK_MUTED }} />
          <Tooltip content={<SliceTip />} cursor={{ fill: "oklch(0.955 0.005 255)" }} />
          <Bar dataKey="count" barSize={14} radius={[0, 4, 4, 0]} minPointSize={2} isAnimationActive={false}
            onClick={(d: { payload?: Slice }) => d.payload && open(d.payload.id)} className="cursor-pointer">
            {slices.map((s) => <Cell key={s.id} fill={colorOf(s.id)} />)}
            <LabelList dataKey="count" position="right" className="num"
              content={(p) => {
                const s = slices[Number(p.index)];
                if (!s) return null;
                const x = Number(p.x) + Number(p.width) + 8;
                const y = Number(p.y) + Number(p.height) / 2;
                return (
                  <text x={x} y={y} dominantBaseline="central" fontSize={13} className="num">
                    <tspan fill="currentColor" fontWeight={600}>{s.count}</tspan>
                    <tspan fill={INK_MUTED}>{`  ${money(s.dollars)}`}</tspan>
                  </text>
                );
              }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Packets submitted: one 100% split bar ---------- */

export function RetailerSplitBar({ slices }: { slices: Slice[] }) {
  const open = useOpenRetailer();
  const total = slices.reduce((t, s) => t + s.count, 0);
  const row = Object.fromEntries(slices.map((s) => [s.id, s.count]));
  const visible = slices.filter((s) => s.count > 0);
  return (
    <div>
      <ResponsiveContainer width="100%" height={18}>
        <BarChart data={[row]} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }} accessibilityLayer>
          <XAxis type="number" hide domain={[0, total]} />
          <YAxis type="category" hide />
          <Tooltip cursor={false} content={({ active }) => active ? (
            <TipBox title="Packets submitted">{slices.map((s) => `${s.name} ${s.count} · ${money(s.dollars)}`).join("  |  ")}</TipBox>
          ) : null} />
          {visible.map((s, i) => (
            <Bar key={s.id} dataKey={s.id} name={s.name} stackId="split" fill={colorOf(s.id)} stroke={SURFACE} strokeWidth={2}
              barSize={18} isAnimationActive={false} onClick={() => open(s.id)} className="cursor-pointer"
              radius={visible.length === 1 ? 4 : i === 0 ? [4, 0, 0, 4] : [0, 4, 4, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      {/* Counts on each side, named, so the split never relies on color. */}
      <div className="mt-3 flex items-start justify-between gap-3 text-sm">
        {slices.map((s, i) => (
          <Link key={s.id} to="/retailers/$retailerId" params={{ retailerId: s.id }}
            className={`flex items-center gap-2 rounded-md hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none ${i === 1 ? "flex-row-reverse text-right" : ""}`}>
            <Swatch id={s.id} />
            <span>
              <span className="block">{s.name} <span className="num font-semibold">{s.count}</span></span>
              <span className="num block text-xs text-muted-foreground">{money(s.dollars)}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ---------- Retailers card: grouped bars by readiness band ---------- */

export function ReadinessChart({ rows, retailers }: {
  rows: { band: string; byRetailer: Record<string, { count: number; dollars: number }> }[];
  retailers: { id: string; name: string }[];
}) {
  const open = useOpenRetailer();
  const data = rows.map((r) => ({ band: r.band, ...Object.fromEntries(retailers.map((x) => [x.id, r.byRetailer[x.id]?.count ?? 0])) }));
  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -24 }} barGap={2} barCategoryGap="28%" accessibilityLayer>
          <XAxis dataKey="band" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: INK_MUTED }} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: INK_MUTED }} width={48} />
          <Tooltip cursor={{ fill: "oklch(0.955 0.005 255)" }} content={({ active, label }) => {
            const row = active ? rows.find((r) => r.band === label) : undefined;
            if (!row) return null;
            return (
              <TipBox title={String(label)}>
                {retailers.map((x) => (
                  <div key={x.id}>{x.name}: {plural(row.byRetailer[x.id]?.count ?? 0, "case")} · {money(row.byRetailer[x.id]?.dollars ?? 0)}</div>
                ))}
              </TipBox>
            );
          }} />
          <Legend verticalAlign="top" align="left" height={28} iconType="square" iconSize={10}
            formatter={(v) => <span className="text-xs text-foreground">{v}</span>} />
          {retailers.map((x) => (
            <Bar key={x.id} dataKey={x.id} name={x.name} fill={colorOf(x.id)} barSize={16} radius={[4, 4, 0, 0]}
              isAnimationActive={false} onClick={() => open(x.id)} className="cursor-pointer">
              <LabelList dataKey={x.id} position="top" fontSize={11} fill={INK_MUTED} className="num" />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
