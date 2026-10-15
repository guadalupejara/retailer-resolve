import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { QueueScreen } from "@/components/QueueScreen";
import { BANDS, PRIORITIES, RETAILER_NAMES, type QueueFilters } from "@/lib/queue";

export const Route = createFileRoute("/_authenticated/")({
  validateSearch: (s: Record<string, unknown>): QueueFilters => ({
    retailer: typeof s["retailer"] === "string" && s["retailer"] in RETAILER_NAMES ? s["retailer"] : undefined,
    priority: PRIORITIES.find((p) => p === s["priority"]),
    band: BANDS.find((b) => b === s["band"]),
  }),
  // Old links used ?retailer=walmart. Each retailer now has its own page.
  beforeLoad: ({ search }) => {
    if (search.retailer) {
      throw redirect({
        to: "/retailers/$retailerId",
        params: { retailerId: search.retailer },
        search: { priority: search.priority, band: search.band },
      });
    }
  },
  head: () => ({
    meta: [
      { title: "Alert queue · Recoverly" },
      { name: "description", content: "Walmart and Amazon chargebacks ranked by deadline, dollars and dispute readiness." },
      { property: "og:title", content: "Alert queue · Recoverly" },
      { property: "og:description", content: "Chargebacks to act on, ranked by deadline and dispute readiness." },
    ],
  }),
  component: AlertQueue,
});

function AlertQueue() {
  const filters = Route.useSearch();
  return (
    <AppShell>
      <QueueScreen filters={filters} />
    </AppShell>
  );
}
