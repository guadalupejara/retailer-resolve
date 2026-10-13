import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { actions, alertsFor, useStore } from "@/lib/store";
import { money } from "@/lib/data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · Recoup Chargeback Recovery" },
      { name: "description", content: "Track retailer deductions and chargebacks across Walmart, Target, Kroger and more." },
      { property: "og:title", content: "Dashboard · Recoup Chargeback Recovery" },
      { property: "og:description", content: "Track retailer deductions and chargebacks in one place." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const s = useStore();
  const [connecting, setConnecting] = useState<string | null>(null);
  const open = s.deductions.filter((d) => d.status === "open");
  const disputed = s.deductions.filter((d) => d.status === "disputed");
  const won = s.deductions.filter((d) => d.status === "won");
  const sum = (a: typeof open) => a.reduce((t, d) => t + d.amount, 0);

  const connect = (id: string) => {
    setConnecting(id);
    setTimeout(() => { actions.connectRetailer(id); setConnecting(null); }, 1200);
  };

  return (
    <AppShell>
      <div className="eyebrow">Overview</div>
      <h1 className="mt-1 text-4xl">Deductions at a glance</h1>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open, not disputed" value={money(sum(open))} sub={`${open.length} deductions`} tone="warning" />
        <Stat label="In dispute" value={money(sum(disputed))} sub={`${disputed.length} pending`} />
        <Stat label="Recovered" value={money(sum(won))} sub={`${won.length} won`} tone="success" />
        <div className="panel p-5">
          <div className="eyebrow">QuickBooks Online</div>
          <div className="mt-2 text-sm font-medium">{s.quickbooks.connected ? s.quickbooks.company : "Not connected"}</div>
          <div className="mt-1 text-xs text-muted-foreground">{s.quickbooks.connected ? `Last sync: ${s.quickbooks.lastSync}` : "Connect to match short-payments to invoices"}</div>
          <div className="mt-3 flex gap-2">
            {s.quickbooks.connected && <button className="btn-outline !py-1 text-xs" onClick={actions.syncQuickBooks}>Sync now</button>}
            <button className={s.quickbooks.connected ? "btn-ghost !py-1 text-xs" : "btn-primary !py-1 text-xs"} onClick={actions.toggleQuickBooks}>
              {s.quickbooks.connected ? "Disconnect" : "Connect"}
            </button>
          </div>
        </div>
      </div>

      <h2 className="mt-12 text-2xl">Retailers</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {s.retailers.map((r) => {
          const mine = s.deductions.filter((d) => d.retailerId === r.id);
          const active = mine.filter((d) => d.status === "open" || d.status === "disputed");
          const crit = r.connected ? alertsFor(s, r).filter((a) => a.level === "critical").length : 0;
          return (
            <div key={r.id} className="panel flex flex-col p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl">{r.name}</h3>
                  <div className="text-xs text-muted-foreground">{r.portal}</div>
                </div>
                {r.connected
                  ? <span className="chip-won">Connected</span>
                  : <span className="chip bg-muted text-muted-foreground">Not connected</span>}
              </div>
              {r.connected ? (
                <>
                  <div className="mt-5 grid grid-cols-3 gap-2 text-sm">
                    <div><div className="eyebrow">Active</div><div className="num mt-1">{active.length}</div></div>
                    <div><div className="eyebrow">At risk</div><div className="num mt-1">{money(active.reduce((t, d) => t + d.amount, 0))}</div></div>
                    <div><div className="eyebrow">Window</div><div className="num mt-1">{r.policy.disputeWindowDays}d</div></div>
                  </div>
                  {crit > 0 && <div className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{crit} urgent alert{crit > 1 ? "s" : ""}</div>}
                  <Link to="/retailers/$retailerId" params={{ retailerId: r.id }} className="btn-outline mt-5">Open {r.name}</Link>
                </>
              ) : (
                <>
                  <p className="mt-4 flex-1 text-sm text-muted-foreground">Connect your vendor portal to pull deductions, remittances and backup automatically.</p>
                  <button className="btn-primary mt-5" disabled={connecting === r.id} onClick={() => connect(r.id)}>
                    {connecting === r.id ? "Connecting…" : `Connect ${r.portal}`}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "warning" | "success" }) {
  const c = tone === "warning" ? "text-warning-foreground" : tone === "success" ? "text-success" : "text-primary";
  return (
    <div className="panel p-5">
      <div className="eyebrow">{label}</div>
      <div className={`num mt-2 text-2xl ${c}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
