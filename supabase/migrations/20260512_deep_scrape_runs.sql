-- VMScore: bandeja segura para scraping profundo antes de importar datos.

create table if not exists public.external_scrape_runs (
  id uuid primary key default uuid_generate_v4(),
  provider text not null default 'copafacil',
  source_url text not null,
  event_code text,
  division_code text,
  mode text not null default 'safe_snapshot',
  status text not null default 'completed',
  extracted jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  error text,
  created_by uuid,
  reviewed_at timestamptz,
  imported_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint external_scrape_runs_status_check
    check (status in ('queued', 'running', 'completed', 'failed', 'reviewed', 'imported', 'ignored'))
);

create index if not exists external_scrape_runs_created_at_idx
on public.external_scrape_runs(created_at desc);

create index if not exists external_scrape_runs_provider_event_idx
on public.external_scrape_runs(provider, event_code, division_code);

alter table public.external_scrape_runs enable row level security;

drop policy if exists "admin gestiona capturas de scraping" on public.external_scrape_runs;
create policy "admin gestiona capturas de scraping"
on public.external_scrape_runs
for all
to public
using (exists (select 1 from public.admin_roles where user_id = auth.uid()))
with check (exists (select 1 from public.admin_roles where user_id = auth.uid()));
