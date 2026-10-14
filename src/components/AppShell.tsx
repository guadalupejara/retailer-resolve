import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useStore } from "@/lib/store";
import { inScope } from "@/lib/data";
import { ROLE_LABELS, useCurrentUser } from "@/lib/current-user";

export function AppShell({ children }: { children: ReactNode }) {
  const s = useStore();
  const { users, currentUser, setCurrentUserId } = useCurrentUser();
  const nav = "block rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground";
  const active = { className: "block rounded-md px-3 py-2 text-sm bg-sidebar-foreground/15 text-sidebar-foreground" };
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar p-4 md:flex">
        <Link to="/" className="mb-8 px-3 pt-2 font-display text-2xl text-sidebar-foreground">
          recoup<span className="text-accent">.</span>
        </Link>
        <nav className="space-y-1">
          <Link to="/" className={nav} activeProps={active} activeOptions={{ exact: true }}>Dashboard</Link>
          <Link to="/documents" className={nav} activeProps={active}>Documents</Link>
        </nav>
        <div className="mt-6 px-3 eyebrow !text-sidebar-foreground/50">Retailers</div>
        <nav className="mt-2 space-y-1">
          {s.retailers.filter((r) => r.connected && inScope(r)).map((r) => (
            <Link key={r.id} to="/retailers/$retailerId" params={{ retailerId: r.id }} className={nav} activeProps={active}>
              {r.name}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-md bg-sidebar-foreground/10 p-3 text-xs text-sidebar-foreground/80">
          <label htmlFor="role-switcher" className="eyebrow !text-sidebar-foreground/50">Working as</label>
          <select
            id="role-switcher"
            className="input mt-2 !py-1.5 text-xs"
            value={currentUser?.id ?? ""}
            disabled={users.length === 0}
            onChange={(e) => setCurrentUserId(e.target.value)}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name} · {ROLE_LABELS[u.role]}</option>
            ))}
          </select>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden px-6 py-8 md:px-10">{children}</main>
    </div>
  );
}
