-- VMScore: DT por equipo/partido, convocados historicos y herramientas reservadas.

alter table public.teams
  add column if not exists technical_director text;

alter table public.matches
  add column if not exists home_technical_director text,
  add column if not exists away_technical_director text;

alter table public.match_lineups
  add column if not exists player_name_snapshot text;

update public.match_lineups ml
set player_name_snapshot = coalesce(
  (select p.display_name from public.players p where p.id = ml.player_id),
  ml.manual_player_name
)
where ml.player_name_snapshot is null;

create or replace function public.capture_match_technical_directors()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.home_technical_director is null then
    select technical_director into new.home_technical_director
    from public.teams where id = new.home_team_id;
  end if;

  if new.away_technical_director is null then
    select technical_director into new.away_technical_director
    from public.teams where id = new.away_team_id;
  end if;

  return new;
end;
$$;

drop trigger if exists capture_match_technical_directors on public.matches;
create trigger capture_match_technical_directors
before insert on public.matches
for each row execute function public.capture_match_technical_directors();

insert into public.league_teams (league_id, team_id)
select distinct p.league_id, participant.team_id
from public.matches m
join public.phases p on p.id = m.phase_id
cross join lateral (
  values (m.home_team_id), (m.away_team_id)
) as participant(team_id)
where participant.team_id is not null
on conflict (league_id, team_id) do nothing;

create or replace function public.enforce_match_league_teams()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_league_id uuid;
begin
  select league_id into v_league_id
  from public.phases
  where id = new.phase_id;

  if v_league_id is null then
    raise exception 'La fase elegida no pertenece a una liga valida';
  end if;

  if not exists (
    select 1 from public.league_teams
    where league_id = v_league_id and team_id = new.home_team_id
  ) or not exists (
    select 1 from public.league_teams
    where league_id = v_league_id and team_id = new.away_team_id
  ) then
    raise exception 'Ambos equipos deben estar inscriptos en la liga antes de cargar el partido';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_match_league_teams on public.matches;
create trigger enforce_match_league_teams
before insert or update of phase_id, home_team_id, away_team_id on public.matches
for each row execute function public.enforce_match_league_teams();

create or replace function public.capture_lineup_player_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.player_name_snapshot is null or new.player_name_snapshot = '' then
    if new.player_id is not null then
      select display_name into new.player_name_snapshot
      from public.players where id = new.player_id;
    else
      new.player_name_snapshot := new.manual_player_name;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists capture_lineup_player_name on public.match_lineups;
create trigger capture_lineup_player_name
before insert on public.match_lineups
for each row execute function public.capture_lineup_player_name();

create unique index if not exists match_lineups_unique_roster_player
on public.match_lineups(match_id, team_id, player_id)
where player_id is not null;

create or replace view public.v_match_lineups as
select
  ml.id,
  ml.match_id,
  ml.team_id,
  t.name as team_name,
  t.short_name as team_short_name,
  ml.player_id,
  coalesce(ml.player_name_snapshot, p.display_name, ml.manual_player_name) as player_name,
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

create or replace view public.v_matches as
select
  m.id,
  m.phase_id,
  m.group_id,
  m.scheduled_at,
  m.round,
  m.status,
  m.home_score,
  m.away_score,
  m.notes,
  m.updated_at,
  m.mvp_player_name,
  m.mvp_team_id,
  ht.id as home_team_id,
  ht.name as home_team_name,
  ht.short_name as home_team_short_name,
  ht.logo_url as home_team_logo_url,
  ht.primary_color as home_primary_color,
  ht.secondary_color as home_secondary_color,
  at.id as away_team_id,
  at.name as away_team_name,
  at.short_name as away_team_short_name,
  at.logo_url as away_team_logo_url,
  at.primary_color as away_primary_color,
  at.secondary_color as away_secondary_color,
  v.id as venue_id,
  v.name as venue_name,
  v.address as venue_address,
  r.id as referee_id,
  r.name as referee_name,
  p.name as phase_name,
  p.type as phase_type,
  p.league_id,
  l.name as league_name,
  l.season,
  l.year,
  l.gender,
  l.organization_id,
  o.name as organization_name,
  o.slug as organization_slug,
  o.city as organization_city,
  o.province as organization_province,
  l.approval_status as league_approval_status,
  l.is_archived as league_is_archived,
  o.status as organization_status,
  sp.id as sport_id,
  sp.name as sport_name,
  sp.slug as sport_slug,
  sp.icon as sport_icon,
  g.name as group_name,
  m.date_tbd,
  m.external_provider,
  m.external_source_id,
  m.external_match_id,
  coalesce(m.home_technical_director, ht.technical_director) as home_technical_director,
  coalesce(m.away_technical_director, at.technical_director) as away_technical_director
from public.matches m
join public.teams ht on m.home_team_id = ht.id
join public.teams at on m.away_team_id = at.id
join public.phases p on m.phase_id = p.id
join public.leagues l on p.league_id = l.id
join public.organizations o on o.id = l.organization_id
join public.sports sp on l.sport_id = sp.id
left join public.venues v on m.venue_id = v.id
left join public.referees r on m.referee_id = r.id
left join public.groups g on m.group_id = g.id
where o.status = 'active'
  and l.approval_status = 'approved'
  and coalesce(l.is_archived, false) = false;

create or replace function public.record_manual_live_goal(
  p_match_id uuid,
  p_team_id uuid,
  p_minute integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_event public.live_sync_events%rowtype;
  v_side text;
  v_home integer;
  v_away integer;
  v_goal_number integer;
  v_league_id uuid;
begin
  select *
  into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Partido no encontrado';
  end if;

  select league_id into v_league_id
  from public.phases
  where id = v_match.phase_id;

  if not public.can_manage_league(v_league_id) then
    raise exception 'No tenes permiso para publicar eventos en vivo de este partido';
  end if;

  if v_match.status in ('finished', 'postponed', 'cancelled') then
    raise exception 'El partido no admite eventos en vivo';
  end if;

  if p_team_id = v_match.home_team_id then
    v_side := 'home';
  elsif p_team_id = v_match.away_team_id then
    v_side := 'away';
  else
    raise exception 'El equipo no participa del partido';
  end if;

  v_home := coalesce(v_match.home_score, 0);
  v_away := coalesce(v_match.away_score, 0);

  if v_side = 'home' then
    v_home := v_home + 1;
    v_goal_number := v_home;
  else
    v_away := v_away + 1;
    v_goal_number := v_away;
  end if;

  update public.matches
  set status = 'in_progress',
      home_score = v_home,
      away_score = v_away,
      updated_at = now()
  where id = p_match_id;

  insert into public.live_sync_events (
    match_id,
    provider,
    event_key,
    event_type,
    team_id,
    team_side,
    minute,
    home_score,
    away_score,
    goal_number,
    title,
    status,
    raw
  )
  values (
    p_match_id,
    'manual',
    'goal-' || v_side || '-' || v_goal_number,
    'goal',
    p_team_id,
    v_side,
    p_minute,
    v_home,
    v_away,
    v_goal_number,
    'Gol',
    'applied',
    jsonb_build_object('source', 'manual')
  )
  returning * into v_event;

  return jsonb_build_object(
    'event', to_jsonb(v_event),
    'home_score', v_home,
    'away_score', v_away
  );
end;
$$;

revoke all on function public.record_manual_live_goal(uuid, uuid, integer) from public;
grant execute on function public.record_manual_live_goal(uuid, uuid, integer) to authenticated;

create or replace function public.record_manual_push_delivery(
  p_event_id uuid,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_provider text;
  v_league_id uuid;
begin
  select event.match_id, event.provider
  into v_match_id, v_provider
  from public.live_sync_events event
  where event.id = p_event_id;

  if v_match_id is null or v_provider <> 'manual' then
    raise exception 'El evento manual no existe';
  end if;

  select p.league_id into v_league_id
  from public.matches m
  join public.phases p on p.id = m.phase_id
  where m.id = v_match_id;

  if not public.can_manage_league(v_league_id) then
    raise exception 'No tenes permiso para actualizar esta entrega';
  end if;

  update public.live_sync_events
  set push_attempted_at = now(),
      push_notified_at = case when p_error is null then now() else push_notified_at end,
      push_error = p_error
  where id = p_event_id;
end;
$$;

revoke all on function public.record_manual_push_delivery(uuid, text) from public;
grant execute on function public.record_manual_push_delivery(uuid, text) to authenticated;

drop policy if exists "escritura admin sports" on public.sports;
drop policy if exists "escritura superadmin sports" on public.sports;
create policy "escritura superadmin sports"
on public.sports
for all
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists "escritura admin venues" on public.venues;
drop policy if exists "escritura superadmin venues" on public.venues;
create policy "escritura superadmin venues"
on public.venues
for all
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists "escritura admin referees" on public.referees;
drop policy if exists "escritura superadmin referees" on public.referees;
create policy "escritura superadmin referees"
on public.referees
for all
using (public.is_superadmin())
with check (public.is_superadmin());
