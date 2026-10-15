import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { addEvidence } from "@/lib/decisions";
import { useCurrentUser } from "@/lib/current-user";
import { ALLOWED_FILE_EXT, demoFileFor, EVIDENCE_FIELDS, MAX_FILE_BYTES, type EvidenceDocType, type FieldSpec, type ScoreSummary } from "@/lib/evidence-fields";
import { DOC_LABEL } from "@/lib/case-view";

type FieldValue = string | boolean | number | null;

export interface EvidenceRowLite {
  doc_type: string;
  storage_path: string;
  variant: string | null;
  extracted: Record<string, unknown>;
}

const humanize = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Field values for a doc type: the existing document's values when there is one, otherwise empty. */
function prefillFor(docType: EvidenceDocType, existing: EvidenceRowLite | undefined): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const f of EVIDENCE_FIELDS[docType]) {
    const v = existing?.extracted[f.key];
    out[f.key] = v === undefined ? null : (v as FieldValue);
  }
  return out;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function FieldInput({ spec, value, onChange }: { spec: FieldSpec; value: FieldValue; onChange: (v: FieldValue) => void }) {
  if (spec.kind === "bool") {
    return (
      <select className="input" value={value === true ? "yes" : value === false ? "no" : ""}
        onChange={(e) => onChange(e.target.value === "yes" ? true : e.target.value === "no" ? false : null)}>
        <option value="">Not set</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    );
  }
  if (spec.kind === "number") {
    return <input type="number" step="0.01" className="input" value={value == null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
  }
  return <input className="input" value={value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value || null)} />;
}

/**
 * Add evidence: pick a document type the case needs, choose a file, check the AI-read fields, save.
 * Saving replaces the case's existing document of that type and rescores the case.
 */
export function AddEvidence({ caseId, docOptions, evidence, embedded = false, onSaved }: {
  caseId: string; docOptions: EvidenceDocType[]; evidence: EvidenceRowLite[];
  /** Inside a sheet or dialog: no card border and no own title. */
  embedded?: boolean;
  /** Called after the document is saved and the case rescored (e.g. to close the sheet). */
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const { currentUser } = useCurrentUser();
  const existingOf = (t: string) => evidence.find((e) => e.doc_type === t);

  const [docType, setDocType] = useState<EvidenceDocType | null>(docOptions[0] ?? null);
  const [fields, setFields] = useState<Record<string, FieldValue>>(() => (docOptions[0] ? prefillFor(docOptions[0], existingOf(docOptions[0])) : {}));
  const [file, setFile] = useState<{ name: string; base64: string; variant: "uploaded" | "demo" } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const pick = (t: EvidenceDocType) => {
    setDocType(t);
    setFields(prefillFor(t, existingOf(t)));
  };

  const save = useMutation({
    mutationFn: () => {
      if (!docType || !file) throw new Error("Choose a document type and a file.");
      return addEvidence({
        data: { caseId, userId: currentUser?.id ?? "", docType, fields, fileName: file.name, fileBase64: file.base64, variant: file.variant },
      });
    },
    onSuccess: (res) => {
      qc.setQueryData(["rescore", caseId], { before: res.before as ScoreSummary, after: res.after as ScoreSummary, run: Date.now() });
      void qc.invalidateQueries({ queryKey: ["chargebacks"] });
      void qc.invalidateQueries({ queryKey: ["audit", caseId] });
      setFile(null);
      setLocalError(null);
      onSaved?.();
    },
  });

  const chooseFile = async (f: File | undefined) => {
    setLocalError(null);
    if (!f) return setFile(null);
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!(ALLOWED_FILE_EXT as readonly string[]).includes(ext)) return setLocalError("Use a PDF, PNG, JPG or TXT file.");
    if (f.size > MAX_FILE_BYTES) return setLocalError("The file is over 6 MB.");
    setFile({ name: f.name, base64: toBase64(await f.arrayBuffer()), variant: "uploaded" });
  };

  const useDemo = async () => {
    setLocalError(null);
    const demo = demoFileFor(caseId);
    const res = await fetch(demo.url);
    if (!res.ok) return setLocalError("Couldn't load the demo file.");
    setFile({ name: demo.name, base64: toBase64(await res.arrayBuffer()), variant: "demo" });
    // The demo file is a stamped POD: mark the stamp as seen and pick the POD type.
    if (docOptions.includes("pod")) {
      setDocType("pod");
      setFields({ ...prefillFor("pod", existingOf("pod")), stamp_or_signature: true });
    }
  };

  if (docOptions.length === 0) {
    return <div className={`${embedded ? "" : "panel p-6 "}text-sm text-muted-foreground`}>This case doesn't need any evidence documents.</div>;
  }

  const specs = docType ? EVIDENCE_FIELDS[docType] : [];
  const error = localError ?? (save.isError ? save.error.message : null);

  return (
    <div className={embedded ? "" : "panel p-6"}>
      <div className="flex flex-wrap items-center gap-3">
        {!embedded && <div className="eyebrow">Add evidence</div>}
        <button className="btn-outline !py-1.5 text-xs" onClick={useDemo} type="button">Use demo file ({demoFileFor(caseId).label})</button>
      </div>

      <div className={`mt-5 grid gap-4 ${embedded ? "" : "md:grid-cols-2"}`}>
        <label className="block">
          <span className="eyebrow">Document type</span>
          <select className="input mt-1.5" value={docType ?? ""} onChange={(e) => pick(e.target.value as EvidenceDocType)}>
            {docOptions.map((t) => <option key={t} value={t}>{DOC_LABEL[t] ?? t}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="eyebrow">File</span>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" className="input mt-1.5"
            onChange={(e) => void chooseFile(e.target.files?.[0])} />
          {file && (
            <span className="mt-1 block text-xs text-muted-foreground">
              {file.name}{file.variant === "demo" ? " (demo file)" : ""}
            </span>
          )}
        </label>
      </div>

      {docType && (
        <div className="mt-5 rounded-xl border border-dashed border-border p-4">
          <div className="eyebrow">AI-read, please verify</div>
          <div className={`mt-3 grid gap-3 ${embedded ? "" : "md:grid-cols-2"}`}>
            {specs.map((f) => (
              <label key={f.key} className="block text-sm">
                <span className="text-muted-foreground">{humanize(f.key)}</span>
                <div className="mt-1">
                  <FieldInput spec={f} value={fields[f.key] ?? null} onChange={(v) => setFields((p) => ({ ...p, [f.key]: v }))} />
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {error && <div className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={!docType || !file || save.isPending || !currentUser} onClick={() => save.mutate()}>
          {save.isPending ? "Saving and rescoring…" : "Save and rescore"}
        </button>
      </div>
    </div>
  );
}
