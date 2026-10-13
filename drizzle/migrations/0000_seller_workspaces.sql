CREATE TABLE public.seller_workspaces (
  user_id uuid PRIMARY KEY,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_workspaces TO authenticated;
GRANT ALL ON public.seller_workspaces TO service_role;
ALTER TABLE public.seller_workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own workspace select" ON public.seller_workspaces FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own workspace insert" ON public.seller_workspaces FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own workspace update" ON public.seller_workspaces FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);