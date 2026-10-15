// The KPI card shared by the home dashboard and the retailer pages, so both rows look the same.
// Place it in a `grid grid-cols-12 gap-6` row: it spans 3 of 12 columns at xl.
import type { ReactNode } from "react";

export function KpiCard({ label, value, full, urgent = false, children }: {
  /** Plain text, or a link (the dashboard links each label to its filtered list). */
  label: ReactNode;
  value: string;
  /** Full value for the hover title, e.g. $56,401.04 behind $56.4K. */
  full?: string | undefined;
  /** Critical: a small soft red dot next to the label. */
  urgent?: boolean;
  /** Optional footer pinned to the bottom of the card (the dashboard's Walmart / Amazon split bar). */
  children?: ReactNode;
}) {
  return (
    <section className="panel col-span-12 flex h-28 min-w-0 flex-col px-6 py-4 sm:col-span-6 xl:col-span-3">
      <div className="flex min-w-0 items-center gap-1.5 text-[13px] leading-4 font-medium text-muted-foreground">
        {typeof label === "string" ? <span className="truncate" title={label}>{label}</span> : label}
        {urgent && <span className="size-2 shrink-0 rounded-full bg-destructive/70" aria-hidden />}
      </div>
      <div className="num mt-1 truncate text-[28px] leading-7 font-semibold tracking-[-0.02em]" title={full}>{value}</div>
      {children && <div className="mt-auto">{children}</div>}
    </section>
  );
}
