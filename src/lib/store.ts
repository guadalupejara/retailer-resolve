import { useSyncExternalStore } from "react";
import * as seed from "./data";
import type { Deduction, Doc, Retailer, DocKind } from "./data";
import { TODAY, daysLeft } from "./data";

interface State {
  retailers: Retailer[];
  deductions: Deduction[];
  documents: Doc[];
}

let state: State = {
  retailers: seed.retailers,
  deductions: seed.deductions,
  documents: seed.documents,
};
const initial = state;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (fn: (s: State) => State) => {
  state = fn(state);
  emit();
};

export function useStore() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
    () => initial,
  );
}

export const actions = {
  connectRetailer: (id: string) =>
    set((s) => ({ ...s, retailers: s.retailers.map((r) => (r.id === id ? { ...r, connected: true } : r)) })),
  disconnectRetailer: (id: string) =>
    set((s) => ({ ...s, retailers: s.retailers.map((r) => (r.id === id ? { ...r, connected: false } : r)) })),
  uploadDoc: (retailerId: string, name: string, kind: DocKind, po: string) => {
    const doc: Doc = { id: `F-${Date.now()}`, retailerId, name, kind, po, date: TODAY.toISOString().slice(0, 10), source: "Upload" };
    set((s) => ({ ...s, documents: [doc, ...s.documents] }));
    return doc;
  },
  submitDispute: (id: string, reason: string, docIds: string[], note: string) =>
    set((s) => ({
      ...s,
      deductions: s.deductions.map((d) =>
        d.id === id ? { ...d, status: "disputed", dispute: { submittedAt: TODAY.toISOString().slice(0, 10), reason, docIds, note } } : d,
      ),
    })),
};

export interface Alert {
  level: "critical" | "warning" | "info";
  title: string;
  detail: string;
  deductionId?: string;
}

export function alertsFor(s: State, r: Retailer): Alert[] {
  const out: Alert[] = [];
  for (const d of s.deductions.filter((x) => x.retailerId === r.id && x.status === "open")) {
    const left = daysLeft(d, r);
    if (left <= 0) out.push({ level: "critical", title: `${d.id} dispute window closed`, detail: `${r.name} allows ${r.policy.disputeWindowDays} days. This deduction can no longer be disputed through the portal.`, deductionId: d.id });
    else if (left <= 14) out.push({ level: "critical", title: `${d.id}: ${left} days left to dispute`, detail: `${r.name}'s ${r.policy.disputeWindowDays}-day window closes soon.`, deductionId: d.id });
    const have = new Set(s.documents.filter((doc) => doc.po === d.po).map((doc) => doc.kind));
    const missing = r.policy.requiredDocs.filter((k) => !have.has(k));
    if (missing.length) out.push({ level: "warning", title: `${d.id} missing backup: ${missing.join(", ")}`, detail: `${r.name} requires ${r.policy.requiredDocs.join(", ")} for disputes on ${d.po}.`, deductionId: d.id });
    if (!d.qbSynced) out.push({ level: "info", title: `${d.id} not yet in QuickBooks`, detail: `Invoice ${d.invoice} short-paid — sync to record the deduction.`, deductionId: d.id });
  }
  for (const u of r.policy.updates) out.push({ level: "info", title: `Policy update · ${u.date}`, detail: u.text });
  const rank = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
