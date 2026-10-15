import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { BarChart3, ChevronDown, ChevronRight, FileText, LayoutDashboard, RotateCcw, Store } from "lucide-react";
import { resetDemo } from "@/lib/decisions";
import { useChargebacks } from "@/lib/chargebacks";
import { buildQueue, RETAILER_NAMES } from "@/lib/queue";
import { ROLE_LABELS, useCurrentUser } from "@/lib/current-user";
import type { Deduction } from "@/lib/scoring";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-x-hidden px-6 py-10 md:px-12">{children}</main>
      </div>
    </div>
  );
}

/* ---------- Sidebar ---------- */

type Icon = ComponentType<{ className?: string }>;

function Sidebar() {
  const q = useChargebacks();
  // Badge = open cases in that retailer's alert queue (the scorable, not-done rows).
  const openByRetailer = useMemo(() => {
    const counts: Record<string, number> = {};
    if (q.data) for (const r of buildQueue(q.data.scored, q.data.queue).scorable) counts[r.deduction.retailer_id] = (counts[r.deduction.retailer_id] ?? 0) + 1;
    return counts;
  }, [q.data]);
  const demoToday = q.data?.settings.demo_today;

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-sidebar px-3 py-5 md:flex">
      <Link to="/" className="mb-8 px-3 text-xl font-semibold tracking-[-0.02em] text-foreground">Recoverly</Link>

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
                <Store className={`size-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                <span className="flex-1">{name}</span>
                {q.data && <span className="num rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">{openByRetailer[id] ?? 0}</span>}
              </>
            )}
          </Link>
        ))}
      </nav>

      <div className="mt-auto px-3">
        <span className="chip-neutral">Demo date{demoToday ? ` · ${formatIsoDate(demoToday)}` : ""}</span>
      </div>
    </aside>
  );
}

const navClass = "flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground";
const navActive = "bg-card text-foreground shadow-sm ring-1 ring-border hover:bg-card";

function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mb-1.5 px-3 text-xs font-medium text-muted-foreground ${className}`}>{children}</div>;
}

function NavItem({ to, icon: I, label, exact }: { to: "/" | "/insights" | "/documents"; icon: Icon; label: string; exact?: boolean }) {
  return (
    <Link to={to} className={navClass} activeProps={{ className: navActive }} activeOptions={{ exact: !!exact, includeSearch: false }}>
      {({ isActive }) => (
        <>
          <I className={`size-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
          {label}
        </>
      )}
    </Link>
  );
}

/** "2026-10-16" -> "Oct 16, 2026". Formatting only; the date itself comes from settings.demo_today. */
function formatIsoDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/* ---------- Top bar ---------- */

function TopBar() {
  const q = useChargebacks();
  const synced = q.dataUpdatedAt ? new Date(q.dataUpdatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null;
  return (
    <header className="sticky top-0 z-30 grid h-16 grid-cols-[1fr_minmax(0,28rem)_1fr] items-center gap-4 border-b border-border bg-background/85 px-6 backdrop-blur md:px-12">
      <Breadcrumbs />
      <CaseSearch />
      <div className="flex items-center justify-end gap-4">
        <span className="hidden text-xs text-muted-foreground lg:inline">{q.isFetching ? "Syncing…" : synced ? `Synced ${synced}` : ""}</span>
        <ProfileMenu />
      </div>
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
  if (!retailerPage && !casePage) return <div />;

  crumbs = [{ label: "Dashboard", to: <Link to="/" className="hover:text-foreground">Dashboard</Link> }];
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

/* ---------- Search ---------- */

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function CaseSearch() {
  const q = useChargebacks();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");

  // Cmd/Ctrl+K focuses the search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle || !q.data) return [];
    const hits = q.data.scored
      .map((x) => x.deduction)
      .filter((d) => d.retailer_id in RETAILER_NAMES)
      .filter((d) => [d.id, d.po_number, d.invoice_number, d.title].some((f) => String(f ?? "").toLowerCase().includes(needle)))
      .slice(0, 8);
    const byRetailer = new Map<string, Deduction[]>();
    for (const d of hits) byRetailer.set(d.retailer_id, [...(byRetailer.get(d.retailer_id) ?? []), d]);
    return [...byRetailer.entries()];
  }, [query, q.data]);

  // Keep the first result highlighted so Enter opens it straight away.
  const firstId = groups[0]?.[1][0]?.id ?? "";
  useEffect(() => setSelected(firstId), [firstId]);

  const close = () => {
    setOpen(false);
    inputRef.current?.blur();
  };
  const openCase = (id: string) => {
    setQuery("");
    close();
    navigate({ to: "/cases/$id", params: { id } });
  };

  return (
    <Command
      shouldFilter={false}
      value={selected}
      onValueChange={setSelected}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
      }}
      className="relative overflow-visible rounded-[10px] border border-input bg-card focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 [&_[cmdk-input-wrapper]]:border-0"
    >
      <div className="flex items-center">
        <div className="min-w-0 flex-1">
          <CommandInput
            ref={inputRef}
            value={query}
            onValueChange={(v) => {
              setQuery(v);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            placeholder="Search case ID, PO or invoice..."
            aria-label="Search cases"
            className="h-9 py-2"
          />
        </div>
        <kbd className="mr-2 hidden shrink-0 rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </div>
      {open && query.trim() && (
        // preventDefault keeps focus in the input, so a click on a result isn't lost to the blur.
        <CommandList onMouseDown={(e) => e.preventDefault()} className="absolute inset-x-0 top-full z-50 mt-2 max-h-96 rounded-xl border border-border bg-popover p-1 shadow-lg">
          <CommandEmpty>{q.data ? "No cases match." : "Loading cases…"}</CommandEmpty>
          {groups.map(([retailerId, rows]) => (
            <CommandGroup key={retailerId} heading={RETAILER_NAMES[retailerId] ?? retailerId}>
              {rows.map((d) => (
                <CommandItem key={d.id} value={d.id} onSelect={() => openCase(d.id)} className="flex-col items-start gap-0.5 rounded-lg px-3 py-2">
                  <div className="flex w-full items-baseline gap-2">
                    <span className="num font-medium">{d.id}</span>
                    <span className="truncate text-muted-foreground">{d.title}</span>
                  </div>
                  <div className="num text-xs text-muted-foreground">PO {d.po_number} · Invoice {d.invoice_number}</div>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      )}
    </Command>
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
      <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/30">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials}</span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-sm font-medium">{currentUser?.name ?? "Loading…"}</span>
          <span className="block text-xs text-muted-foreground">{currentUser ? ROLE_LABELS[currentUser.role] : ""}</span>
        </span>
        <ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
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
