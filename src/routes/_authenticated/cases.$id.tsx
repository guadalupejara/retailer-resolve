import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/cases/$id")({
  head: ({ params }) => ({
    meta: [{ title: `${params.id} · Recoup` }],
  }),
  component: CasePage,
});

// Placeholder: the case detail screen comes next.
function CasePage() {
  const { id } = Route.useParams();
  return (
    <AppShell>
      <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">← Alert queue</Link>
      <div className="eyebrow mt-2">Case</div>
      <h1 className="mt-1 text-4xl">{id}</h1>
      <p className="mt-4 text-sm text-muted-foreground">Case detail is not built yet.</p>
    </AppShell>
  );
}
