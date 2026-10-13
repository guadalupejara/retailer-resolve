import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DocList } from "@/components/Docs";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/_authenticated/documents")({
  head: () => ({
    meta: [
      { title: "Documents · Recoup" },
      { name: "description", content: "All BOLs, PODs, invoices and promo agreements, organized by retailer." },
      { property: "og:title", content: "Documents · Recoup" },
      { property: "og:description", content: "Supporting documents organized by retailer." },
    ],
  }),
  component: DocumentsPage,
});

function DocumentsPage() {
  const s = useStore();
  const [q, setQ] = useState("");
  const match = (x: string) => x.toLowerCase().includes(q.toLowerCase());
  return (
    <AppShell>
      <div className="eyebrow">Library</div>
      <h1 className="mt-1 text-4xl">Supporting documents</h1>
      <input className="input mt-6 max-w-md" placeholder="Search by PO, file name or type…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-8 space-y-10">
        {s.retailers.map((r) => {
          const docs = s.documents.filter((d) => d.retailerId === r.id && (match(d.name) || match(d.po) || match(d.kind)));
          if (!docs.length && q) return null;
          return (
            <section key={r.id}>
              <div className="mb-3 flex items-baseline gap-3">
                <h2 className="text-2xl">{r.name}</h2>
                <span className="text-xs text-muted-foreground">{docs.length} files</span>
              </div>
              <DocList docs={docs} />
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}
