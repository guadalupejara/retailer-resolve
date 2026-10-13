import { useState } from "react";
import type { Doc, DocKind } from "@/lib/data";
import { actions } from "@/lib/store";

const KINDS: DocKind[] = ["BOL", "POD", "Invoice", "PO", "ASN", "Promo agreement", "Photo"];

export function DocList({ docs, selectable, selected, onToggle }: {
  docs: Doc[]; selectable?: boolean; selected?: string[]; onToggle?: (id: string) => void;
}) {
  if (!docs.length) return <div className="panel p-6 text-center text-sm text-muted-foreground">No documents yet.</div>;
  return (
    <div className="panel divide-y divide-border">
      {docs.map((d) => (
        <label key={d.id} className={`flex items-center gap-3 px-4 py-3 text-sm ${selectable ? "cursor-pointer hover:bg-secondary/50" : ""}`}>
          {selectable && <input type="checkbox" className="accent-primary" checked={selected?.includes(d.id)} onChange={() => onToggle?.(d.id)} />}
          <div className="flex h-9 w-9 items-center justify-center rounded bg-secondary text-[10px] font-semibold text-muted-foreground">
            {d.name.split(".").pop()?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{d.name}</div>
            <div className="num text-xs text-muted-foreground">{d.po} · {d.date} · {d.source}</div>
          </div>
          <span className="chip-disputed">{d.kind}</span>
        </label>
      ))}
    </div>
  );
}

export function UploadDoc({ retailerId, defaultPo = "", onUploaded }: { retailerId: string; defaultPo?: string; onUploaded?: (d: Doc) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<DocKind>("POD");
  const [po, setPo] = useState(defaultPo);
  return (
    <form className="panel flex flex-wrap items-end gap-3 p-4" onSubmit={(e) => {
      e.preventDefault();
      if (!file || !po) return;
      const d = actions.uploadDoc(retailerId, file.name, kind, po);
      onUploaded?.(d);
      setFile(null);
      (e.target as HTMLFormElement).reset();
    }}>
      <div className="min-w-48 flex-1">
        <div className="eyebrow mb-1">File</div>
        <input type="file" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div>
        <div className="eyebrow mb-1">Type</div>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as DocKind)}>
          {KINDS.map((k) => <option key={k}>{k}</option>)}
        </select>
      </div>
      <div>
        <div className="eyebrow mb-1">PO #</div>
        <input className="input num" value={po} onChange={(e) => setPo(e.target.value)} placeholder="PO-…" />
      </div>
      <button className="btn-primary" disabled={!file || !po}>Upload</button>
    </form>
  );
}
