import { createFileRoute, notFound } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { QueueScreen } from "@/components/QueueScreen";
import { BANDS, PRIORITIES, RETAILER_NAMES } from "@/lib/queue";
import type { Band, Priority } from "@/lib/scoring";

export const Route = createFileRoute("/_authenticated/retailers/$retailerId")({
  validateSearch: (s: Record<string, unknown>): { priority?: Priority | undefined; band?: Band | undefined } => ({
    priority: PRIORITIES.find((p) => p === s["priority"]),
    band: BANDS.find((b) => b === s["band"]),
  }),
  beforeLoad: ({ params }) => {
    if (!(params.retailerId in RETAILER_NAMES)) throw notFound();
  },
  head: ({ params }) => ({
    meta: [{ title: `${RETAILER_NAMES[params.retailerId] ?? "Retailer"} · Recoverly` }],
  }),
  component: RetailerQueue,
});

function RetailerQueue() {
  const { retailerId } = Route.useParams();
  const search = Route.useSearch();
  return (
    <AppShell>
      <QueueScreen filters={{ retailer: retailerId, ...search }} />
    </AppShell>
  );
}
