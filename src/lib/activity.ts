// Activity timeline data: audit_log rows for one case, newest first. A browser read with the publishable key
// (RLS allows demo reads). Writes never happen here; they go through the decision server functions.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AuditRow {
  id: string;
  deduction_id: string;
  actor: string;
  action: string;
  note: string | null;
  score_at_action: number | null;
  at: string;
}

interface AuditQuery {
  select: (c: string) => AuditQuery;
  eq: (c: string, v: string) => AuditQuery;
  order: (c: string, o: { ascending: boolean }) => PromiseLike<{ data: AuditRow[] | null; error: { message: string } | null }>;
}

export function useActivity(caseId: string) {
  return useQuery({
    queryKey: ["audit", caseId],
    queryFn: async () => {
      // audit_log isn't in the generated Database types yet, so skip the typed client (as chargebacks.ts does).
      const db = supabase as unknown as { from: (t: string) => AuditQuery };
      const { data, error } = await db.from("audit_log").select("*").eq("deduction_id", caseId).order("at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}
