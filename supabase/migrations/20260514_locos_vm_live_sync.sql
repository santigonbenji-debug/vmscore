-- VMScore: vinculos de partidos con Locos por el Futbol VM y novedades en vivo asistidas.

create table if not exists public.match_live_links (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid not null references public.matches(id) on delete cascade,
  provider text not null default 'locos_vm',
  external_match_id text not null,
  external_url text,
  enabled boolean not null default true,
  last_external_state jsonb not null default '{}'::jsonb,
  last_status text,
  last_period text,
  last_minute integer,
  last_second integer,
  last_home_score integer,
  last_away_score integer,
  last_synced_at timestamptz,
  last_start_notified_at timestamptz,
  last_finish_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, provider)
);

create table if not exists public.live_sync_events (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid not null references public.matches(id) on delete cascade,
  link_id uuid references public.match_live_links(id) on delete cascade,
  provider text not null default 'locos_vm',
  external_match_id text,
  event_key text not null,
  event_type text not null,
  team_id uuid references public.teams(id),
  team_side text,
  minute integer,
  home_score integer,
  away_score integer,
  title text not null,
  status text not null default 'pending',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, provider, event_key)
);

alter table public.match_live_links enable row level security;
alter table public.live_sync_events enable row level security;

drop policy if exists "lectura publica match_live_links" on public.match_live_links;
create policy "lectura publica match_live_links"
on public.match_live_links
for select
to public
using (true);

drop policy if exists "escritura admin match_live_links" on public.match_live_links;
create policy "escritura admin match_live_links"
on public.match_live_links
for all
to public
using (exists (select 1 from public.admin_roles where admin_roles.user_id = auth.uid()))
with check (exists (select 1 from public.admin_roles where admin_roles.user_id = auth.uid()));

drop policy if exists "lectura publica live_sync_events" on public.live_sync_events;
create policy "lectura publica live_sync_events"
on public.live_sync_events
for select
to public
using (true);

drop policy if exists "escritura admin live_sync_events" on public.live_sync_events;
create policy "escritura admin live_sync_events"
on public.live_sync_events
for all
to public
using (exists (select 1 from public.admin_roles where admin_roles.user_id = auth.uid()))
with check (exists (select 1 from public.admin_roles where admin_roles.user_id = auth.uid()));

do $$
begin
  begin
    alter publication supabase_realtime add table public.match_live_links;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.live_sync_events;
  exception when duplicate_object then null;
  end;
end $$;
