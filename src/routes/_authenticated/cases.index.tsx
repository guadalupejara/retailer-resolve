import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { QueueScreen } from "@/components/QueueScreen";
import { parseQueueSearch } from "@/lib/queue";

// Every retailer's queue in one table. The home cards and "View all" link here.
export const Route = createFileRoute("/_authenticated/cases/")({
  validateSearch: parseQueueSearch,
  head: () => ({
    meta: [
      { title: "All cases · Recoverly" },
      { name: "description", content: "Walmart and Amazon chargebacks ranked by deadline, dollars and dispute readiness." },
    ],
  }),
  component: AllCases,
});

function AllCases() {
  const search = Route.useSearch();
  return (
    <AppShell>
      <QueueScreen filters={search} />
    </AppShell>
  );
}
