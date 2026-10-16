// Loads the chargeback-mock tables from Supabase and scores every case.
// Adapted for retailer-resolve (TanStack Start + Lovable Cloud), replacing the
// package's Next.js loader. Put scoring.ts from the package next to this file
// at src/lib/scoring.ts.
//
// Uses the app's existing Supabase client (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY),
// so no new env vars are needed. Reads only; writes go through a server function later.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseSettings, scoreAll, sortQueue } from "./scoring";
import { fetchSeed, type SeedDb } from "./seed";

/** Loads the case tables from Supabase, scores every case and builds the queue. */
export async function loadAndScore() {
  // These tables aren't in the generated Database types yet, so skip the typed client here.
  const db = supabase as unknown as SeedDb;
  const seed = await fetchSeed(db);
  const scored = scoreAll(seed);
  const queue = sortQueue(scored.map((x) => ({ result: x.result, amount: Number(x.deduction.amount) })));
  // The case and documents pages also read the raw evidence, code mappings and settings.
  return { scored, queue, seed, settings: parseSettings(seed.settings) };
}

/** React hook: const { data, isLoading, error } = useChargebacks(); */
export function useChargebacks() {
  return useQuery({ queryKey: ["chargebacks"], queryFn: loadAndScore, staleTime: 60_000 });
}

/**
 * URL for an evidence file. Seeded mock files ("evidence/<case>/<file>") are served by the app from
 * public/evidence/. Uploaded files ("<case>/<file>") come from the public "evidence" storage bucket.
 */
export function evidenceUrl(storagePath: string) {
  const clean = storagePath.replace(/^\/+/, "");
  if (clean.startsWith("evidence/")) return "/" + clean;
  const base = String(import.meta.env["VITE_SUPABASE_URL"] ?? "").replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/evidence/${clean}`;
}
