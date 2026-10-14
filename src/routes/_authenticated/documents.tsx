import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { evidenceUrl, useChargebacks } from "@/lib/chargebacks";
import { DOC_LABEL, documentGroups, type EvidenceRow } from "@/lib/case-view";
import { money } from "@/lib/queue";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({
    meta: [
      { title: "Documents · Recoup" },
      { name: "description", content: "Walmart and Amazon case evidence, grouped by retailer and case." },
      { property: "og:title", content: "Documents · Recoup" },
      { property: "og:description", content: "Case evidence grouped by retailer." },
    ],
  }),
  component: DocumentsPage,
});

function DocumentsPage() {
  const q = useChargebacks();
  const [search, setSearch] = useState("");
  const groups = q.data ? documentGroups(q.data.seed.evidence as unknown as EvidenceRow[], q.data.scored.map((x) => x.deduction), search) : [];

  return (
    <AppShell>
      <div className="eyebrow">Library</div>
      <h1 className="mt-1 text-4xl">Case documents</h1>
      <input
        className="input mt-6 max-w-md"
        placeholder="Search by case, PO, document type or file name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {q.isPending && <div className="panel mt-8 p-10 text-center text-sm text-muted-foreground">Loading documents from Supabase…</div>}
      {q.isError && (
        <div className="panel mt-8 border-l-4 border-l-destructive p-5 text-sm">
          <div className="font-medium text-destructive">Couldn't load documents</div>
          <div className="mt-1 text-muted-foreground">{q.error.message}</div>
        </div>
      )}

      {q.data && groups.length === 0 && (
        <div className="panel mt-8 p-10 text-center text-sm text-muted-foreground">No documents match this search.</div>
      )}

      <div className="mt-8 space-y-10">
        {groups.map((g) => (
          <section key={g.retailerId}>
            <div className="mb-3 flex items-baseline gap-3">
              <h2 className="text-2xl">{g.name}</h2>
              <span className="text-xs text-muted-foreground">
                {g.cases.length} cases · {g.cases.reduce((t, c) => t + c.files.length, 0)} files
              </span>
            </div>
            <div className="space-y-4">
              {g.cases.map(({ deduction: d, files }) => (
                <div key={d.id} className="panel p-4">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <Link to="/cases/$id" params={{ id: d.id }} className="num font-medium text-primary hover:underline">{d.id}</Link>
                    <span className="text-sm">{d.title}</span>
                    <span className="num ml-auto text-xs text-muted-foreground">{money(Number(d.amount))}</span>
                  </div>
                  <ul className="mt-3 divide-y divide-border">
                    {files.map((f) => (
                      <li key={f.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                        <span className="w-44">{DOC_LABEL[f.doc_type] ?? f.doc_type}</span>
                        <span className="chip bg-muted text-muted-foreground">{f.variant ?? "—"}</span>
                        <span className="num flex-1 truncate text-xs text-muted-foreground">{f.storage_path.split("/").pop()}</span>
                        <a href={evidenceUrl(f.storage_path)} target="_blank" rel="noopener noreferrer" className="btn-ghost !py-1 text-xs">Open ↗</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
