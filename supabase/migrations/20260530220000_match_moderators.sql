begin;

alter table public.admin_roles
  drop constraint if exists admin_roles_role_check;

alter table public.admin_roles
  add constraint admin_roles_role_check
  check (role in ('superadmin', 'organization_admin', 'liga_admin', 'club_admin', 'match_moderator'));

alter table public.admin_roles
  add column if not exists email text,
  add column if not exists display_name text;

create index if not exists admin_roles_match_moderator_idx
  on public.admin_roles(user_id, league_id)
  where role = 'match_moderator';

create or replace function public.can_moderate_league(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_roles ar
    join public.leagues l on l.id = ar.league_id
    join public.organizations o on o.id = l.organization_id
    where ar.user_id = auth.uid()
      and ar.role = 'match_moderator'
      and ar.league_id = p_league_id
      and coalesce(ar.status, 'active') = 'active'
      and o.status = 'active'
      and l.approval_status = 'approved'
      and coalesce(l.is_archived, false) = false
  );
$$;

create or replace function public.can_moderate_match(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matches m
    join public.phases p on p.id = m.phase_id
    where m.id = p_match_id
      and public.can_moderate_league(p.league_id)
  );
$$;

create or replace function public.guard_match_moderator_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_league_id uuid;
begin
  select league_id into v_old_league_id
  from public.phases
  where id = old.phase_id;

  if public.can_moderate_match(old.id) and not public.can_manage_league(v_old_league_id) then
    if new.phase_id is distinct from old.phase_id
      or new.home_team_id is distinct from old.home_team_id
      or new.away_team_id is distinct from old.away_team_id
      or new.external_provider is distinct from old.external_provider
      or new.external_source_id is distinct from old.external_source_id
      or new.external_match_id is distinct from old.external_match_id
    then
      raise exception 'El moderador solo puede editar la operacion del partido';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_match_moderator_update on public.matches;
create trigger guard_match_moderator_update
before update on public.matches
for each row
execute function public.guard_match_moderator_update();

drop policy if exists "moderador actualiza partidos de su liga" on public.matches;
create policy "moderador actualiza partidos de su liga"
on public.matches
for update
using (
  exists (
    select 1
    from public.phases p
    where p.id = matches.phase_id
      and public.can_moderate_league(p.league_id)
  )
)
with check (
  exists (
    select 1
    from public.phases p
    join public.leagues l on l.id = p.league_id
    left join public.venues v on v.id = matches.venue_id
    left join public.referees r on r.id = matches.referee_id
    where p.id = matches.phase_id
      and public.can_moderate_league(l.id)
      and exists (
        select 1 from public.league_teams lt
        where lt.league_id = l.id
          and lt.team_id = matches.home_team_id
      )
      and exists (
        select 1 from public.league_teams lt
        where lt.league_id = l.id
          and lt.team_id = matches.away_team_id
      )
      and (matches.venue_id is null or v.organization_id = l.organization_id)
      and (matches.referee_id is null or r.organization_id = l.organization_id)
  )
);

drop policy if exists "moderador gestiona eventos de su liga" on public.match_events;
create policy "moderador gestiona eventos de su liga"
on public.match_events
for all
using (public.can_moderate_match(match_id))
with check (public.can_moderate_match(match_id));

drop policy if exists "moderador gestiona convocados de su liga" on public.match_lineups;
create policy "moderador gestiona convocados de su liga"
on public.match_lineups
for all
using (public.can_moderate_match(match_id))
with check (public.can_moderate_match(match_id));

drop policy if exists "moderador gestiona dt de su liga" on public.match_staff;
create policy "moderador gestiona dt de su liga"
on public.match_staff
for all
using (public.can_moderate_match(match_id))
with check (public.can_moderate_match(match_id));

create or replace function public.list_match_moderators()
returns table (
  user_id uuid,
  email text,
  display_name text,
  league_id uuid,
  league_name text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'No autorizado';
  end if;

  return query
  select
    ar.user_id,
    ar.email,
    ar.display_name,
    ar.league_id,
    l.name,
    ar.status,
    ar.created_at
  from public.admin_roles ar
  left join public.leagues l on l.id = ar.league_id
  where ar.role = 'match_moderator'
  order by coalesce(ar.display_name, ar.email), l.name;
end;
$$;

revoke all on function public.list_match_moderators() from public;
grant execute on function public.list_match_moderators() to authenticated;

create or replace function public.set_match_moderator_status(
  p_user_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'No autorizado';
  end if;

  if p_status not in ('active', 'blocked') then
    raise exception 'Estado invalido';
  end if;

  update public.admin_roles
  set status = p_status
  where user_id = p_user_id
    and role = 'match_moderator';
end;
$$;

revoke all on function public.set_match_moderator_status(uuid, text) from public;
grant execute on function public.set_match_moderator_status(uuid, text) to authenticated;

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

  if not (public.can_manage_league(v_league_id) or public.can_moderate_match(p_match_id)) then
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

  if not (public.can_manage_league(v_league_id) or public.can_moderate_match(v_match_id)) then
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

commit;
