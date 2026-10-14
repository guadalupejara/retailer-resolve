import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useChargebacks } from "@/lib/chargebacks";
import type { Band, Priority } from "@/lib/scoring";
import {
  BANDS, CLOCK_LABEL, PRIORITIES, RECOMMENDATION_LABEL, RETAILER_NAMES, STATE_LABEL,
  applyFilters, buildQueue, money, queueStats, scoreLabel, type QueueFilters, type QueueRow,
} from "@/lib/queue";

export const Route = createFileRoute("/_authenticated/")({
  validateSearch: (s: Record<string, unknown>): QueueFilters => ({
    retailer: typeof s["retailer"] === "string" && s["retailer"] in RETAILER_NAMES ? s["retailer"] : undefined,
    priority: PRIORITIES.find((p) => p === s["priority"]),
    band: BANDS.find((b) => b === s["band"]),
  }),
  head: () => ({
    meta: [
      { title: "Alert queue · Recoup" },
      { name: "description", content: "Walmart and Amazon chargebacks ranked by deadline, dollars and dispute readiness." },
      { property: "og:title", content: "Alert queue · Recoup" },
      { property: "og:description", content: "Chargebacks to act on, ranked by deadline and dispute readiness." },
    ],
  }),
  component: AlertQueue,
});

const PRIORITY_CHIP: Record<Priority, string> = {
  Critical: "chip-lost",
  High: "chip-open",
  Normal: "chip-disputed",
  Low: "chip bg-muted text-muted-foreground",
};

const BAND_CHIP: Record<Band, string> = {
  Ready: "chip-won",
  "Needs work": "chip-open",
  Weak: "chip-lost",
};

function AlertQueue() {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  const q = useChargebacks();

  const setFilter = (patch: QueueFilters) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const data = q.data ? buildQueue(q.data.scored, q.data.queue) : null;
  // Stats and the not-scorable list follow the retailer filter only. Priority and band filter the table.
  const byRetailer = data ? applyFilters(data.scorable, { retailer: filters.retailer }) : [];
  const stats = queueStats(byRetailer);
  const table = applyFilters(byRetailer, { priority: filters.priority, band: filters.band });
  const notScorable = data ? applyFilters(data.notScorable, { retailer: filters.retailer }) : [];
  const shown = (n: number) => (data ? n : "—");

  return (
    <AppShell>
      <div className="eyebrow">Alert queue</div>
      <h1 className="mt-1 text-4xl">Chargebacks to act on</h1>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Open dollars at stake" value={data ? money(stats.openDollars) : "—"} tone="warning" />
        <Stat label="Critical" value={String(shown(stats.critical))} tone="danger" />
        <Stat label="Ready to submit" value={String(shown(stats.readyToSubmit))} tone="success" />
        <Stat label="Expiring in 7 days or less" value={String(shown(stats.expiringWithin7))} tone="danger" />
      </div>

      <div className="mt-10 flex flex-wrap gap-4">
        <FilterSelect label="Retailer" value={filters.retailer ?? ""} onChange={(v) => setFilter({ retailer: v || undefined })}
          options={[["", "All retailers"], ...Object.entries(RETAILER_NAMES)]} />
        <FilterSelect label="Priority" value={filters.priority ?? ""} onChange={(v) => setFilter({ priority: (v || undefined) as Priority | undefined })}
          options={[["", "All priorities"], ...PRIORITIES.map((p): [string, string] => [p, p])]} />
        <FilterSelect label="Band" value={filters.band ?? ""} onChange={(v) => setFilter({ band: (v || undefined) as Band | undefined })}
          options={[["", "All bands"], ...BANDS.map((b): [string, string] => [b, b])]} />
      </div>

      <div className="mt-6">
        {q.isPending && <div className="panel p-10 text-center text-sm text-muted-foreground">Loading cases from Supabase…</div>}

        {q.isError && (
          <div className="panel border-l-4 border-l-destructive p-5 text-sm">
            <div className="font-medium text-destructive">Couldn't load the queue</div>
            <div className="mt-1 text-muted-foreground">{q.error.message}</div>
          </div>
        )}

        {data && (
          <>
            <div className="panel overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left">
                  <tr className="eyebrow">
                    <th className="px-4 py-3">Priority</th><th className="px-4 py-3">Case</th><th className="px-4 py-3">Retailer</th>
                    <th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Days left</th>
                    <th className="px-4 py-3">Score</th><th className="px-4 py-3">Band</th><th className="px-4 py-3">Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((r) => (
                    <tr key={r.deduction.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
                      <td className="px-4 py-3">{r.result.priority && <span className={PRIORITY_CHIP[r.result.priority]}>{r.result.priority}</span>}</td>
                      <td className="px-4 py-3">
                        <Link to="/cases/$id" params={{ id: r.deduction.id }} className="num font-medium text-primary hover:underline">{r.deduction.id}</Link>
                        <div className="text-xs text-muted-foreground">{r.deduction.title}</div>
                      </td>
                      <td className="px-4 py-3">{RETAILER_NAMES[r.deduction.retailer_id] ?? r.deduction.retailer_id}</td>
                      <td className="num px-4 py-3 text-right">{money(r.amount)}</td>
                      <td className="num px-4 py-3">
                        {r.result.days_left == null ? "—" : (
                          <>
                            <span className={r.result.days_left <= 7 ? "font-semibold text-destructive" : ""}>{r.result.days_left}d</span>
                            {r.result.clock && <div className="text-xs text-muted-foreground">{CLOCK_LABEL[r.result.clock]}</div>}
                          </>
                        )}
                      </td>
                      <td className="num px-4 py-3">{scoreLabel(r.result)}</td>
                      <td className="px-4 py-3">{r.result.band && <span className={BAND_CHIP[r.result.band]}>{r.result.band}</span>}</td>
                      <td className="px-4 py-3">{r.result.recommendation && RECOMMENDATION_LABEL[r.result.recommendation]}</td>
                    </tr>
                  ))}
                  {table.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No cases match these filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <h2 className="mt-12 text-2xl">Not scorable</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Expired, final, routed, or needing human review. These have no score or priority.
            </p>
            <div className="panel mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left">
                  <tr className="eyebrow">
                    <th className="px-4 py-3">Case</th><th className="px-4 py-3">Retailer</th>
                    <th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Recommendation</th>
                  </tr>
                </thead>
                <tbody>
                  {notScorable.map((r: QueueRow) => (
                    <tr key={r.deduction.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
                      <td className="px-4 py-3">
                        <Link to="/cases/$id" params={{ id: r.deduction.id }} className="num font-medium text-primary hover:underline">{r.deduction.id}</Link>
                        <div className="text-xs text-muted-foreground">{r.deduction.title}</div>
                      </td>
                      <td className="px-4 py-3">{RETAILER_NAMES[r.deduction.retailer_id] ?? r.deduction.retailer_id}</td>
                      <td className="num px-4 py-3 text-right">{money(r.amount)}</td>
                      <td className="px-4 py-3">{STATE_LABEL[r.result.state]}</td>
                      <td className="px-4 py-3">{r.result.recommendation && RECOMMENDATION_LABEL[r.result.recommendation]}</td>
                    </tr>
                  ))}
                  {notScorable.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Nothing here.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <label className="min-w-40">
      <span className="eyebrow">{label}</span>
      <select className="input mt-1.5" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </label>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warning" | "success" | "danger" }) {
  const c = tone === "warning" ? "text-warning-foreground" : tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : "text-primary";
  return (
    <div className="panel p-5">
      <div className="eyebrow">{label}</div>
      <div className={`num mt-2 text-2xl ${c}`}>{value}</div>
    </div>
  );
}
