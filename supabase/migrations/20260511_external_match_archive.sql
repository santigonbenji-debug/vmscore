-- VMScore: guardar datos externos sin afectar partidos oficiales ni tablas.

create table if not exists public.external_match_archive (
  id uuid primary key default uuid_generate_v4(),
  source_id uuid not null references public.external_sources(id) on delete cascade,
  external_match_id text not null,
  external_home_team_id text,
  external_away_team_id text,
  mapped_home_team_id uuid references public.teams(id) on delete set null,
  mapped_away_team_id uuid references public.teams(id) on delete set null,
  round integer,
  status text,
  home_score integer,
  away_score integer,
  scheduled_at timestamptz,
  date_tbd boolean not null default true,
  raw jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (source_id, external_match_id)
);

alter table public.external_match_archive enable row level security;

drop policy if exists "admin gestiona archivo externo" on public.external_match_archive;
create policy "admin gestiona archivo externo"
on public.external_match_archive
for all
to public
using (exists (select 1 from public.admin_roles where user_id = auth.uid()))
with check (exists (select 1 from public.admin_roles where user_id = auth.uid()));
