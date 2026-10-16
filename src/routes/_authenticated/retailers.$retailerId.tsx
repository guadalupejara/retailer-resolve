import { createFileRoute, notFound } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { QueueScreen } from "@/components/QueueScreen";
import { RETAILER_NAMES, parseQueueSearch } from "@/lib/queue";

export const Route = createFileRoute("/_authenticated/retailers/$retailerId")({
  validateSearch: parseQueueSearch,
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
      <QueueScreen filters={search} retailerFromPath={retailerId} />
    </AppShell>
  );
}
