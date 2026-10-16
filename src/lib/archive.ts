// Closed disputes (outcomes_archive). A browser read with the publishable key. Insights never writes.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ArchiveRow } from "./insights";

interface ArchiveQuery {
  select: (c: string) => PromiseLike<{ data: ArchiveRow[] | null; error: { message: string } | null }>;
}

export function useOutcomes() {
  return useQuery({
    queryKey: ["outcomes_archive"],
    queryFn: async () => {
      const db = supabase as unknown as { from: (t: string) => ArchiveQuery };
      const { data, error } = await db.from("outcomes_archive").select("*");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 60_000,
  });
}
