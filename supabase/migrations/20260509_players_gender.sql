-- VMScore: separar planteles por genero dentro de cada equipo.
-- El deporte sigue viniendo de teams.sport_id; el genero vive en players.gender.

alter table public.players
  add column if not exists gender text not null default 'masculino';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'players_gender_check'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint players_gender_check
      check (gender in ('masculino', 'femenino', 'mixto'))
      not valid;
  end if;

  begin
    alter table public.players validate constraint players_gender_check;
  exception
    when others then null;
  end;
end $$;

create index if not exists players_team_gender_idx on public.players(team_id, gender);

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
