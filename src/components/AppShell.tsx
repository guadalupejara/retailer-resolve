import { Link, useRouterState } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, type ComponentType, type ReactNode } from "react";
import { BarChart3, ChevronDown, ChevronRight, FileText, LayoutDashboard, RotateCcw, Store } from "lucide-react";
import { resetDemo } from "@/lib/decisions";
import { useChargebacks } from "@/lib/chargebacks";
import { buildQueue, RETAILER_NAMES } from "@/lib/queue";
import { ROLE_LABELS, useCurrentUser } from "@/lib/current-user";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-w-0 flex-1 overflow-x-hidden px-4 pt-2 pb-10 md:pr-6 md:pl-2">{children}</main>
      </div>
    </div>
  );
}

/* ---------- Sidebar ---------- */

type Icon = ComponentType<{ className?: string; strokeWidth?: number }>;

function Sidebar() {
  const q = useChargebacks();
  // Badge = open cases in that retailer's alert queue (the scorable, not-done rows).
  const openByRetailer = useMemo(() => {
    const counts: Record<string, number> = {};
    if (q.data) for (const r of buildQueue(q.data.scored, q.data.queue).scorable) counts[r.deduction.retailer_id] = (counts[r.deduction.retailer_id] ?? 0) + 1;
    return counts;
  }, [q.data]);

  return (
    // Floating panel: 16px in from the window edges, fixed in place while the page scrolls.
    <aside className="sticky top-4 m-4 hidden h-[calc(100vh-2rem)] w-56 shrink-0 flex-col overflow-hidden rounded-[24px] bg-sidebar px-3 py-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] md:flex">
      <Link to="/" className="wordmark mb-8 px-3 text-foreground">Recoverly</Link>

      <SectionLabel>Main</SectionLabel>
      <nav className="space-y-0.5">
        <NavItem to="/" icon={LayoutDashboard} label="Dashboard" exact />
        <NavItem to="/insights" icon={BarChart3} label="Insights" />
        <NavItem to="/documents" icon={FileText} label="Documents" />
      </nav>

      <SectionLabel className="mt-7">Retailers</SectionLabel>
      <nav className="space-y-0.5">
        {Object.entries(RETAILER_NAMES).map(([id, name]) => (
          <Link key={id} to="/retailers/$retailerId" params={{ retailerId: id }} className={navClass} activeProps={{ className: navActive }}>
            {({ isActive }) => (
              <>
                <Store className="size-4 shrink-0" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                {q.data && (
                  <span className={`num rounded-full px-2 py-0.5 text-xs font-medium ${isActive ? "bg-primary-foreground/15 text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                    {openByRetailer[id] ?? 0}
                  </span>
                )}
              </>
            )}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

const navClass = "flex items-center gap-3 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none";
const navActive = "!bg-charcoal !text-primary-foreground hover:!text-primary-foreground";

function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mb-1.5 px-3 text-xs font-medium text-tertiary ${className}`}>{children}</div>;
}

function NavItem({ to, icon: I, label, exact }: { to: "/" | "/insights" | "/documents"; icon: Icon; label: string; exact?: boolean }) {
  return (
    <Link to={to} className={navClass} activeProps={{ className: navActive }} activeOptions={{ exact: !!exact, includeSearch: false }}>
      <I className="size-4 shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}

/* ---------- Top bar ---------- */

/** Breadcrumbs left, profile right, on the page background. Search lives only in the dashboard header. */
function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-[72px] items-center gap-4 bg-background px-4 md:pr-6 md:pl-2">
      <div className="min-w-0 flex-1"><Breadcrumbs /></div>
      <ProfileMenu />
    </header>
  );
}

function Breadcrumbs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const q = useChargebacks();
  const retailerPage = pathname.match(/^\/retailers\/([^/]+)/);
  const casePage = pathname.match(/^\/cases\/([^/]+)/);

  let crumbs: { label: string; to?: ReactNode }[] = [];
  let retailerId: string | undefined;
  let caseId: string | undefined;
  if (retailerPage) retailerId = decodeURIComponent(retailerPage[1]!);
  if (casePage) {
    caseId = decodeURIComponent(casePage[1]!);
    retailerId = q.data?.scored.find((x) => x.deduction.id === caseId)?.deduction.retailer_id;
  }
  const allCases = /^\/cases\/?$/.test(pathname);
  if (!retailerPage && !casePage && !allCases) return <div />;

  crumbs = [{ label: "Dashboard", to: <Link to="/" className="hover:text-foreground">Dashboard</Link> }];
  if (allCases) crumbs.push({ label: "All cases" });
  if (retailerId) {
    const name = RETAILER_NAMES[retailerId] ?? retailerId;
    crumbs.push({ label: name, to: caseId ? <Link to="/retailers/$retailerId" params={{ retailerId }} className="hover:text-foreground">{name}</Link> : undefined });
  }
  if (caseId) crumbs.push({ label: caseId });

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
      {crumbs.map((c, i) => (
        <Fragment key={c.label}>
          {i > 0 && <ChevronRight className="size-3.5 shrink-0" />}
          {i === crumbs.length - 1 ? <span className="truncate font-medium text-foreground">{c.label}</span> : c.to}
        </Fragment>
      ))}
    </nav>
  );
}

/* ---------- Profile menu ---------- */

function ProfileMenu() {
  const { users, currentUser, setCurrentUserId } = useCurrentUser();
  const qc = useQueryClient();
  const reset = useMutation({
    mutationFn: () => resetDemo(),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["rescore"] });
      void qc.invalidateQueries();
    },
  });
  const initials = currentUser ? currentUser.name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() : "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex shrink-0 items-center gap-2.5 rounded-full bg-card py-1 pr-3 pl-1 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/30">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sand text-xs font-semibold text-foreground">{initials}</span>
        <span className="hidden leading-tight whitespace-nowrap lg:block">
          <span className="block text-sm font-medium">{currentUser?.name ?? "Loading…"}</span>
          <span className="block text-xs text-muted-foreground">{currentUser ? ROLE_LABELS[currentUser.role] : ""}</span>
        </span>
        <ChevronDown className="hidden size-4 text-muted-foreground lg:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-xl p-1">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Working as</DropdownMenuLabel>
        {users.map((u) => (
          <DropdownMenuCheckboxItem key={u.id} checked={u.id === currentUser?.id} onCheckedChange={() => setCurrentUserId(u.id)} className="rounded-lg">
            <span className="flex flex-col">
              <span>{u.name}</span>
              <span className="text-xs text-muted-foreground">{ROLE_LABELS[u.role]}</span>
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={reset.isPending}
          className="rounded-lg"
          onSelect={() => {
            if (window.confirm("Reset demo data? Every case goes back to its seed status and all activity except imports is deleted.")) reset.mutate();
          }}
        >
          <RotateCcw className="size-4" />
          {reset.isPending ? "Resetting…" : reset.isError ? "Reset failed. Try again." : reset.isSuccess ? "Demo reset" : "Reset demo data"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
