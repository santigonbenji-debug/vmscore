-- VMScore: fuentes externas para importar fixture/resultados.

create table if not exists public.external_sources (
  id uuid primary key default uuid_generate_v4(),
  provider text not null default 'copafacil',
  league_id uuid not null references public.leagues(id) on delete cascade,
  phase_id uuid not null references public.phases(id) on delete cascade,
  label text,
  source_url text not null,
  event_code text not null,
  division_code text not null,
  sync_enabled boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (provider, event_code, division_code)
);

create table if not exists public.external_team_mappings (
  id uuid primary key default uuid_generate_v4(),
  source_id uuid not null references public.external_sources(id) on delete cascade,
  external_team_id text not null,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (source_id, external_team_id)
);

alter table public.matches
  add column if not exists external_provider text,
  add column if not exists external_source_id uuid references public.external_sources(id) on delete set null,
  add column if not exists external_match_id text;

create unique index if not exists ix_matches_external_id
on public.matches (external_provider, external_match_id)
where external_provider is not null and external_match_id is not null;

alter table public.external_sources enable row level security;
alter table public.external_team_mappings enable row level security;

drop policy if exists "admin gestiona fuentes externas" on public.external_sources;
create policy "admin gestiona fuentes externas"
on public.external_sources
for all
to public
using (exists (select 1 from public.admin_roles where user_id = auth.uid()))
with check (exists (select 1 from public.admin_roles where user_id = auth.uid()));

drop policy if exists "admin gestiona mapeos externos" on public.external_team_mappings;
create policy "admin gestiona mapeos externos"
on public.external_team_mappings
for all
to public
using (exists (select 1 from public.admin_roles where user_id = auth.uid()))
with check (exists (select 1 from public.admin_roles where user_id = auth.uid()));
