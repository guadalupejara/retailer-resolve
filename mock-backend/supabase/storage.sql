-- Supabase only (not plain Postgres). Creates a public-read bucket for the mock evidence files.
-- Public read is acceptable here because every file is fictional demo data.
insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', true)
on conflict (id) do nothing;
