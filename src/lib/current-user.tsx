// The demo role switcher: lists app_users from Supabase and keeps the picked user in React context.
// There is no login. Reads use the publishable key, same as chargebacks.ts.
import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AppUser {
  id: string;
  name: string;
  role: "deductions_analyst" | "ar_manager" | "logistics" | "sales";
}

export const ROLE_LABELS: Record<AppUser["role"], string> = {
  deductions_analyst: "Deductions analyst",
  ar_manager: "AR manager",
  logistics: "Logistics",
  sales: "Sales",
};

const DEFAULT_USER_NAME = "Priya Shah";

async function loadAppUsers(): Promise<AppUser[]> {
  // app_users isn't in the generated Database types yet, so skip the typed client (as chargebacks.ts does).
  const db = supabase as unknown as {
    from: (t: string) => {
      select: (c: string) => { order: (col: string) => Promise<{ data: AppUser[] | null; error: { message: string } | null }> };
    };
  };
  const { data, error } = await db.from("app_users").select("id, name, role").order("name");
  if (error) throw new Error(`app_users: ${error.message}`);
  return data ?? [];
}

interface CurrentUserValue {
  users: AppUser[];
  currentUser: AppUser | null;
  setCurrentUserId: (id: string) => void;
}

const CurrentUserContext = createContext<CurrentUserValue | null>(null);

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const { data: users = [] } = useQuery({ queryKey: ["app_users"], queryFn: loadAppUsers, staleTime: 5 * 60_000 });
  const [pickedId, setPickedId] = useState<string | null>(null);
  // Until someone picks a user, default to Priya Shah (falls back to the first user if she is missing).
  const currentUser =
    users.find((u) => u.id === pickedId) ??
    users.find((u) => u.name === DEFAULT_USER_NAME) ??
    users[0] ??
    null;

  return (
    <CurrentUserContext.Provider value={{ users, currentUser, setCurrentUserId: setPickedId }}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser() {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error("useCurrentUser must be used inside CurrentUserProvider");
  return ctx;
}
