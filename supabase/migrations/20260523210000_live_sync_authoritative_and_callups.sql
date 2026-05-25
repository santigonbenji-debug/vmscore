-- VMScore: sincronizacion autoritativa, goles manuales atomicos y convocados.

alter table public.live_sync_events
  add column if not exists goal_number integer;

update public.live_sync_events
set goal_number = case
  when team_side = 'home' then home_score
  when team_side = 'away' then away_score
  else null
end
where event_type = 'goal'
  and goal_number is null;

with numbered as (
  select id,
    row_number() over (
      partition by match_id, team_side
      order by created_at, id
    ) as goal_number
  from public.live_sync_events
  where event_type = 'goal'
    and team_side in ('home', 'away')
    and goal_number is null
)
update public.live_sync_events e
set goal_number = numbered.goal_number
from numbered
where e.id = numbered.id;

with duplicated as (
  select id,
    row_number() over (
      partition by match_id, team_side, goal_number
      order by
        case when provider = 'manual' then 0 else 1 end,
        created_at,
        id
    ) as duplicate_rank
  from public.live_sync_events
  where event_type = 'goal'
    and team_side in ('home', 'away')
    and goal_number is not null
)
delete from public.live_sync_events e
using duplicated d
where e.id = d.id
  and d.duplicate_rank > 1;

update public.live_sync_events
set status = 'dismissed',
    updated_at = now()
where provider = 'locos_vm'
  and status = 'pending';

update public.live_sync_events e
set home_score = m.home_score,
    away_score = m.away_score,
    updated_at = now()
from public.matches m
where e.match_id = m.id
  and e.event_type = 'finish'
  and m.status = 'finished'
  and m.home_score is not null
  and m.away_score is not null
  and (e.home_score is null or e.away_score is null);

update public.match_live_links l
set last_home_score = m.home_score,
    last_away_score = m.away_score,
    updated_at = now()
from public.matches m
where l.match_id = m.id
  and l.last_status = 'finished'
  and m.status = 'finished'
  and m.home_score is not null
  and m.away_score is not null
  and (l.last_home_score is null or l.last_away_score is null);

create unique index if not exists live_sync_goal_number_key
on public.live_sync_events(match_id, team_side, goal_number)
where event_type = 'goal'
  and team_side in ('home', 'away')
  and goal_number is not null;

drop policy if exists "escritura admin match_live_links" on public.match_live_links;
drop policy if exists "escritura superadmin match_live_links" on public.match_live_links;
create policy "escritura superadmin match_live_links"
on public.match_live_links
for all
to public
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists "escritura admin live_sync_events" on public.live_sync_events;
drop policy if exists "escritura superadmin live_sync_events" on public.live_sync_events;
create policy "escritura superadmin live_sync_events"
on public.live_sync_events
for all
to public
using (public.is_superadmin())
with check (public.is_superadmin());

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
begin
  if not public.is_superadmin() then
    raise exception 'Solo el superadmin puede publicar eventos en vivo';
  end if;

  select *
  into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Partido no encontrado';
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

alter table public.match_lineups
  drop constraint if exists match_lineups_role_check;

update public.match_lineups
set role = 'called_up'
where role in ('starter', 'substitute');

alter table public.match_lineups
  add constraint match_lineups_role_check
  check (role in ('called_up', 'starter', 'substitute'));
