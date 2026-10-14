// Loads everything the scoring engine needs from Supabase and scores every case.
// Use it in a Next.js server component or route handler.
//   npm i @supabase/supabase-js
// Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (read-only is enough here)
import { createClient } from "@supabase/supabase-js";
import { scoreAll, sortQueue, type SeedLike } from "./scoring";

const TABLES = ["settings", "templates", "template_lines", "code_mappings", "purchase_orders",
  "invoices", "shipments", "carriers", "asns", "deductions", "evidence", "dispute_history"] as const;

export async function loadAndScore() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const entries = await Promise.all(TABLES.map(async (t) => {
    const { data, error } = await supabase.from(t).select("*");
    if (error) throw new Error(`${t}: ${error.message}`);
    return [t, data] as const;
  }));
  const seed = Object.fromEntries(entries) as unknown as SeedLike;
  const scored = scoreAll(seed);
  const queue = sortQueue(scored.map((x) => ({ result: x.result, amount: Number(x.deduction.amount) })));
  return { scored, queue };
}

// Frozen demo date: the engine reads it from the settings table (demo_today = 2026-10-16),
// so countdowns look the same on Friday no matter when you rehearse.
