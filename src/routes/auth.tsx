import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Recoup" },
      { name: "description", content: "Sign in to Recoup to track retailer chargebacks and win disputes." },
      { property: "og:title", content: "Sign in — Recoup" },
      { property: "og:description", content: "Track retailer chargebacks, policy changes and disputes in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) navigate({ to: "/", replace: true }); });
    const { data: sub } = supabase.auth.onAuthStateChange((e, session) => {
      if (e === "SIGNED_IN" && session) navigate({ to: "/", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
      if (error) setMsg(error.message);
      else if (!data.session) setMsg("Check your email to confirm your account, then sign in.");
    }
    setBusy(false);
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) setMsg(r.error.message);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="font-display text-4xl text-foreground">Recoup</div>
          <p className="mt-2 text-sm text-muted-foreground">Win back retailer chargebacks.</p>
        </div>
        <div className="card p-6">
          <button className="btn-outline w-full justify-center" onClick={google}>Continue with Google</button>
          <div className="my-4 text-center text-xs text-muted-foreground">or</div>
          <form onSubmit={submit} className="space-y-3">
            <input className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button className="btn-primary w-full justify-center" disabled={busy}>{mode === "in" ? "Sign in" : "Create account"}</button>
          </form>
          {msg && <p className="mt-3 text-sm text-muted-foreground">{msg}</p>}
          <button className="mt-4 w-full text-center text-xs text-muted-foreground underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
