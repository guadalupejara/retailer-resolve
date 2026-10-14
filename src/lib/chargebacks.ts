// Loads the chargeback-mock tables from Supabase and scores every case.
// Adapted for retailer-resolve (TanStack Start + Lovable Cloud), replacing the
// package's Next.js loader. Put scoring.ts from the package next to this file
// at src/lib/scoring.ts.
//
// Uses the app's existing Supabase client (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY),
// so no new env vars are needed. Reads only; writes go through a server function later.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { scoreAll, sortQueue, type SeedLike } from "./scoring";

const TABLES = [
  "settings", "templates", "template_lines", "code_mappings", "purchase_orders",
  "invoices", "shipments", "carriers", "asns", "deductions", "evidence", "dispute_history",
] as const;

export async function loadAndScore() {
  // These tables aren't in the generated Database types yet, so skip the typed client here.
  const db = supabase as unknown as {
    from: (t: string) => { select: (c: string) => Promise<{ data: unknown[] | null; error: { message: string } | null }> };
  };
  const entries = await Promise.all(
    TABLES.map(async (t) => {
      const { data, error } = await db.from(t).select("*");
      if (error) throw new Error(`${t}: ${error.message}`);
      return [t, data ?? []] as const;
    }),
  );
  const seed = Object.fromEntries(entries) as unknown as SeedLike;
  const scored = scoreAll(seed);
  const queue = sortQueue(scored.map((x) => ({ result: x.result, amount: Number(x.deduction.amount) })));
  return { scored, queue };
}

/** React hook: const { data, isLoading, error } = useChargebacks(); */
export function useChargebacks() {
  return useQuery({ queryKey: ["chargebacks"], queryFn: loadAndScore, staleTime: 60_000 });
}

/**
 * URL for an evidence file. The mock files are served by the app itself from
 * public/evidence/ (copy mock-backend/evidence there), so no storage bucket is needed.
 * evidenceUrl("evidence/WMT-001/pod.pdf") -> "/evidence/WMT-001/pod.pdf"
 */
export function evidenceUrl(storagePath: string) {
  return "/" + storagePath.replace(/^\/+/, "");
}
