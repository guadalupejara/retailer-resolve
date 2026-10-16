import { useSyncExternalStore } from "react";
import * as seed from "./data";
import type { Retailer } from "./data";

// Only the retailer list is still kept here (the sidebar reads it). Cases come from useChargebacks().
interface State {
  retailers: Retailer[];
}

let state: State = { retailers: seed.retailers };
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
};
