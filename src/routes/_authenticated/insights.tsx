import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { useChargebacks } from "@/lib/chargebacks";
import { useOutcomes } from "@/lib/archive";
import { atStake, denialReasons, outcomeChart, outcomeTotals, splitHistory, type HistoryRow } from "@/lib/insights";
import { buildQueue, money } from "@/lib/queue";
import { compactMoney } from "@/components/RetailerCharts";

export const Route = createFileRoute("/_authenticated/insights")({
  head: () => ({
    meta: [
      { title: "Insights · Recoverly" },
      { name: "description", content: "Recovered and lost dollars, denial reasons and what is at stake." },
      { property: "og:title", content: "Insights · Recoverly" },
      { property: "og:description", content: "Past outcomes and what is at stake now." },
    ],
  }),
  component: InsightsPage,
});

// Theme tokens from styles.css.
const SERIES = [
  { key: "won", label: "Won", fill: "var(--primary)" },
  { key: "denied", label: "Denied", fill: "var(--destructive)" },
  { key: "written_off", label: "Written off", fill: "var(--warning)" },
  { key: "expired", label: "Expired", fill: "var(--tertiary)" },
] as const;

const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);

function InsightsPage() {
  const archive = useOutcomes();
  const q = useChargebacks();

  if (archive.isPending || q.isPending) {
    return <AppShell><div className="panel mt-8 p-10 text-center text-sm text-muted-foreground">Loading insights from Supabase…</div></AppShell>;
  }
  const error = archive.error ?? q.error;
  if (error) {
    return <AppShell><div className="panel mt-8 border-l-4 border-l-destructive p-5 text-sm"><div className="font-medium text-destructive">Couldn't load insights</div><div className="mt-1 text-muted-foreground">{error.message}</div></div></AppShell>;
  }

  const data = q.data;
  if (!data) return null;
  const rows = archive.data ?? [];
  const today = data.settings.demo_today;
  const { kept, excluded } = splitHistory(data.seed.dispute_history as unknown as HistoryRow[], today);
  const totals = outcomeTotals(rows);
  const reasons = denialReasons(rows, kept);
  const chart = outcomeChart(rows);
  const checkLabel = (key: string | null) => {
    if (!key) return "—";
    return (data.seed.template_lines as { check_key: string; label: string }[]).find((l) => l.check_key === key)?.label ?? key;
  };
  const { scorable } = buildQueue(data.scored, data.queue);
  const stake = atStake(scorable.map((r) => ({ amount: r.amount, band: r.result.band, capped_by: r.result.capped_by })));

  return (
    <AppShell>
      <div className="eyebrow">Insights</div>
      <h1 className="mt-1 page-title">What your disputes have done</h1>
      <p className="mt-2 text-sm text-muted-foreground">Read-only. Built from closed disputes and the live queue.</p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Recovered (won)" value={compactMoney(totals.recovered)} full={money(totals.recovered)} sub={`${totals.won.n} disputes`} tone="success" />
        <Stat label="Lost (denied + expired)" value={compactMoney(totals.lost)} full={money(totals.lost)} sub={`${totals.denied.n} denied, ${totals.expired.n} expired`} tone="danger" />
        <Stat label="Written off" value={compactMoney(totals.writtenOff)} full={money(totals.writtenOff)} sub={`${totals.written_off.n} write-off`} />
        <Stat label="Win rate, by count" value={pct(totals.winRate)} sub="won ÷ (won + denied + expired)" />
      </div>

      <h2 className="mt-12 section-title">Past outcome dollars</h2>
      <div className="panel mt-4 h-80 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="group" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => `$${Math.round(Number(v) / 1000)}k`} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => money(Number(v))} cursor={{ fill: "var(--secondary)" }}
              contentStyle={{ background: "var(--popover)", border: "none", borderRadius: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", fontSize: 12 }}
              labelStyle={{ color: "var(--foreground)", fontWeight: 500 }} />
            <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>{v}</span>} />
            {SERIES.map((s) => <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.fill} stroke="var(--card)" strokeWidth={1} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h2 className="mt-12 section-title">Top denial reasons</h2>
      <p className="mt-2 text-sm">Your readiness checks are built from your denial history.</p>
      <div className="panel mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left">
            <tr className="eyebrow">
              <th className="px-4 py-3">Denial reason</th><th className="px-4 py-3 text-right">Count</th>
              <th className="px-4 py-3">Closed disputes</th><th className="px-4 py-3">Scoring check it maps to</th>
            </tr>
          </thead>
          <tbody>
            {reasons.map((r) => (
              <tr key={r.reason} className="border-b border-border last:border-0">
                <td className="px-4 py-3">{r.reason}</td>
                <td className="num px-4 py-3 text-right">{r.count}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{r.archive} archived, {r.history} in history</td>
                <td className="px-4 py-3">{checkLabel(r.checkKey)}</td>
              </tr>
            ))}
            {reasons.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">No denials recorded.</td></tr>}
          </tbody>
        </table>
      </div>
      {excluded.length > 0 && (
        <div className="mt-3 rounded-2xl border border-dashed border-input p-3 text-xs text-muted-foreground">
          <div className="font-medium">Left out: dispute history dated after {today} (fix in the data)</div>
          <ul className="mt-1 list-disc pl-5">
            {excluded.map((h) => <li key={h.id} className="num">{h.id}: {h.deduction_id}, attempt {h.attempt_no}, submitted {h.submitted_on}</li>)}
          </ul>
        </div>
      )}

      <h2 className="mt-12 section-title">What's at stake now</h2>
      <div className="mt-4 grid gap-6 sm:grid-cols-3">
        {(["Ready", "Needs work", "Weak"] as const).map((b) => (
          <Stat key={b} label={`Open, ${b.toLowerCase()}`} value={compactMoney(stake.byBand[b]?.amount ?? 0)} full={money(stake.byBand[b]?.amount ?? 0)} sub={`${stake.byBand[b]?.n ?? 0} cases`} />
        ))}
      </div>
      <div className="panel mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left">
            <tr className="eyebrow"><th className="px-4 py-3">Blocked by fatal check</th><th className="px-4 py-3 text-right">Cases</th><th className="px-4 py-3 text-right">Dollars blocked</th></tr>
          </thead>
          <tbody>
            {stake.blocked.map((b) => (
              <tr key={b.check} className="border-b border-border last:border-0">
                <td className="px-4 py-3">{b.check}</td>
                <td className="num px-4 py-3 text-right">{b.n}</td>
                <td className="num px-4 py-3 text-right">{money(b.amount)}</td>
              </tr>
            ))}
            {stake.blocked.length === 0 && <tr><td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">Nothing is capped by a fatal check.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">A case capped by two checks counts in both rows, so the rows don't add up to the total.</p>
    </AppShell>
  );
}

function Stat({ label, value, full, sub, tone }: { label: string; value: string; full?: string; sub: string; tone?: "success" | "danger" }) {
  const c = tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div className="panel min-w-0 px-5 py-4">
      <div className="truncate text-[13px] font-medium text-muted-foreground" title={label}>{label}</div>
      <div className={`num mt-1.5 truncate text-[26px] leading-none font-semibold tracking-[-0.02em] ${c}`} title={full}>{value}</div>
      <div className="mt-1.5 truncate text-xs text-tertiary" title={sub}>{sub}</div>
    </div>
  );
}
