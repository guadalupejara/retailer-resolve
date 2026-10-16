// Reads every chargeback table from Supabase. Shared by the browser hook (chargebacks.ts),
// the explainCase server function and the AI cache script, so all three see the same rows.
import type { SeedLike } from "./scoring";

export const SEED_TABLES = [
  "settings", "templates", "template_lines", "code_mappings", "purchase_orders",
  "invoices", "shipments", "carriers", "asns", "deductions", "evidence", "dispute_history",
] as const;

/** The subset of the supabase-js client this loader uses. */
export interface SeedDb {
  from: (t: string) => { select: (c: string) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> };
}

export async function fetchSeed(db: SeedDb): Promise<SeedLike> {
  const entries = await Promise.all(
    SEED_TABLES.map(async (t) => {
      const { data, error } = await db.from(t).select("*");
      if (error) throw new Error(`${t}: ${error.message}`);
      return [t, data ?? []] as const;
    }),
  );
  return Object.fromEntries(entries) as unknown as SeedLike;
}
