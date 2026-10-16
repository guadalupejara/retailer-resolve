// Case search: finds loaded cases by id, PO, invoice or title. Lives in the dashboard header.
// Cmd/Ctrl+K focuses it. Arrow keys move, Enter or click opens the case, Esc closes.
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useChargebacks } from "@/lib/chargebacks";
import { RETAILER_NAMES } from "@/lib/queue";
import type { Deduction } from "@/lib/scoring";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function CaseSearch({ className = "" }: { className?: string }) {
  const q = useChargebacks();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");

  // Cmd/Ctrl+K focuses the search from anywhere. Only one CaseSearch is mounted per page.
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
      className={`relative overflow-visible rounded-full bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus-within:ring-2 focus-within:ring-ring/25 [&_[cmdk-input-wrapper]]:border-0 [&_[cmdk-input-wrapper]]:pl-5 [&_[cmdk-input-wrapper]>svg]:hidden ${className}`}
    >
      <div className="flex items-center gap-2 py-1 pr-1">
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
            placeholder="Search case ID, PO or invoice…"
            aria-label="Search cases"
            title={`Search cases (${isMac ? "⌘K" : "Ctrl+K"})`}
            className="h-9 truncate py-2"
          />
        </div>
        {/* Opens the highlighted result, or puts the cursor in the field when nothing is typed yet. */}
        <button type="button" aria-label="Search" onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (selected && query.trim()) return openCase(selected);
            inputRef.current?.focus();
            setOpen(true);
          }}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-charcoal text-primary-foreground hover:bg-charcoal/85 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none">
          <Search className="size-4" strokeWidth={1.75} />
        </button>
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
