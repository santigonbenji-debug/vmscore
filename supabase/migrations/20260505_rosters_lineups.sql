-- VMScore: equipos por liga, jugadores por equipo, cuerpo tecnico y alineaciones por partido.
-- Ejecutar en Supabase SQL Editor. Es idempotente para poder reintentar sin romper.

create extension if not exists "uuid-ossp";

alter table public.leagues
  add column if not exists format text not null default 'round_robin';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leagues_format_check'
      and conrelid = 'public.leagues'::regclass
  ) then
    alter table public.leagues
      add constraint leagues_format_check
      check (format in ('round_robin', 'playoffs', 'championship'))
      not valid;
  end if;

  begin
    alter table public.leagues validate constraint leagues_format_check;
  exception
    when others then null;
  end;
exception
  when others then null;
end $$;

create table if not exists public.players (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid not null references public.teams(id) on delete cascade,
  first_name text,
  last_name text,
  display_name text not null,
  shirt_number integer,
  position text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.staff_members (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  role text,
  phone text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Equipos participantes de una liga. Los jugadores siguen viviendo en teams/players.
create table if not exists public.league_teams (
  id uuid primary key default uuid_generate_v4(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz default now(),
  unique (league_id, team_id)
);

-- Formacion especifica de un partido: titulares/suplentes libres.
-- Puede apuntar a players o guardar un nombre manual si el jugador no existe todavia.
create table if not exists public.match_lineups (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  manual_player_name text,
  role text not null check (role in ('starter', 'substitute')),
  shirt_number integer,
  position text,
  sort_order integer default 0,
  created_at timestamptz default now(),
  constraint match_lineups_player_or_name_check
    check (player_id is not null or nullif(trim(manual_player_name), '') is not null)
);

create table if not exists public.match_staff (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  staff_member_id uuid references public.staff_members(id) on delete set null,
  manual_staff_name text,
  role text,
  sort_order integer default 0,
  created_at timestamptz default now(),
  constraint match_staff_member_or_name_check
    check (staff_member_id is not null or nullif(trim(manual_staff_name), '') is not null)
);

alter table public.match_events
  add column if not exists player_id uuid references public.players(id) on delete set null;

alter table public.matches
  add column if not exists mvp_player_id uuid references public.players(id) on delete set null;

create index if not exists players_team_id_idx on public.players(team_id);
create index if not exists staff_members_team_id_idx on public.staff_members(team_id);
create index if not exists league_teams_league_id_idx on public.league_teams(league_id);
create index if not exists league_teams_team_id_idx on public.league_teams(team_id);
create index if not exists match_lineups_match_team_idx on public.match_lineups(match_id, team_id);
create index if not exists match_events_player_id_idx on public.match_events(player_id);
create index if not exists matches_mvp_player_id_idx on public.matches(mvp_player_id);

alter table public.players enable row level security;
alter table public.staff_members enable row level security;
alter table public.league_teams enable row level security;
alter table public.match_lineups enable row level security;
alter table public.match_staff enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'players',
    'staff_members',
    'league_teams',
    'match_lineups',
    'match_staff'
  ]
  loop
    execute format('drop policy if exists "lectura publica %1$s" on public.%1$I', table_name);
    execute format('create policy "lectura publica %1$s" on public.%1$I for select using (true)', table_name);

    execute format('drop policy if exists "escritura admin %1$s" on public.%1$I', table_name);
    execute format(
      'create policy "escritura admin %1$s" on public.%1$I for all using (
        exists (select 1 from public.admin_roles where user_id = auth.uid())
      ) with check (
        exists (select 1 from public.admin_roles where user_id = auth.uid())
      )',
      table_name
    );
  end loop;
end $$;

create or replace view public.v_league_teams as
select
  lt.id,
  lt.league_id,
  l.name as league_name,
  l.sport_id,
  lt.team_id,
  t.name as team_name,
  t.short_name as team_short_name,
  t.logo_url as team_logo_url,
  t.primary_color,
  t.secondary_color,
  (
    select count(*)
    from public.players p
    where p.team_id = t.id and coalesce(p.is_active, true)
  ) as players_count
from public.league_teams lt
join public.leagues l on l.id = lt.league_id
join public.teams t on t.id = lt.team_id;

create or replace view public.v_match_lineups as
select
  ml.id,
  ml.match_id,
  ml.team_id,
  t.name as team_name,
  t.short_name as team_short_name,
  ml.player_id,
  coalesce(p.display_name, ml.manual_player_name) as player_name,
  p.first_name,
  p.last_name,
  coalesce(ml.shirt_number, p.shirt_number) as shirt_number,
  coalesce(ml.position, p.position) as position,
  ml.role,
  ml.sort_order
from public.match_lineups ml
join public.teams t on t.id = ml.team_id
left join public.players p on p.id = ml.player_id
order by ml.match_id, ml.team_id, ml.role, ml.sort_order, player_name;
