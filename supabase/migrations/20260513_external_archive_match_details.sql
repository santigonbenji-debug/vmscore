-- VMScore: completar detalles de partidos importados antes de publicarlos.

alter table public.external_match_archive
  add column if not exists venue_id uuid references public.venues(id) on delete set null,
  add column if not exists referee_id uuid references public.referees(id) on delete set null;

drop view if exists public.v_external_matches_public;

create or replace view public.v_external_matches_public as
select
  a.id as archive_id,
  a.source_id,
  a.external_match_id,
  a.round,
  a.status,
  a.home_score,
  a.away_score,
  a.scheduled_at,
  a.date_tbd,
  a.review_status,
  a.preferred_display,
  a.mapped_home_team_id as home_team_id,
  ht.name as home_team_name,
  ht.short_name as home_team_short_name,
  ht.logo_url as home_team_logo_url,
  ht.primary_color as home_primary_color,
  ht.secondary_color as home_secondary_color,
  a.mapped_away_team_id as away_team_id,
  at.name as away_team_name,
  at.short_name as away_team_short_name,
  at.logo_url as away_team_logo_url,
  at.primary_color as away_primary_color,
  at.secondary_color as away_secondary_color,
  a.venue_id,
  v.name as venue_name,
  v.address as venue_address,
  a.referee_id,
  r.name as referee_name,
  es.phase_id,
  p.name as phase_name,
  p.type as phase_type,
  es.league_id,
  l.name as league_name,
  l.season,
  l.year,
  l.gender,
  sp.id as sport_id,
  sp.name as sport_name,
  sp.slug as sport_slug,
  sp.icon as sport_icon
from public.external_match_archive a
join public.external_sources es on es.id = a.source_id
left join public.teams ht on ht.id = a.mapped_home_team_id
left join public.teams at on at.id = a.mapped_away_team_id
left join public.venues v on v.id = a.venue_id
left join public.referees r on r.id = a.referee_id
left join public.phases p on p.id = es.phase_id
left join public.leagues l on l.id = es.league_id
left join public.sports sp on sp.id = l.sport_id
where a.review_status in ('confirmed', 'pending');

create or replace function public.publish_external_match(
  p_archive_id uuid,
  p_target_match_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  archive_row public.external_match_archive%rowtype;
  source_row public.external_sources%rowtype;
  target_id uuid;
begin
  if not exists (
    select 1
    from public.admin_roles
    where user_id = auth.uid()
  ) then
    raise exception 'No autorizado';
  end if;

  select *
    into archive_row
  from public.external_match_archive
  where id = p_archive_id;

  if not found then
    raise exception 'Historico no encontrado';
  end if;

  select *
    into source_row
  from public.external_sources
  where id = archive_row.source_id;

  if not found then
    raise exception 'Fuente externa no encontrada';
  end if;

  if archive_row.mapped_home_team_id is null or archive_row.mapped_away_team_id is null then
    raise exception 'Falta mapear equipos';
  end if;

  target_id := p_target_match_id;

  if target_id is null then
    target_id := archive_row.computed_match_id;
  end if;

  if target_id is null then
    select id
      into target_id
    from public.matches
    where external_provider = source_row.provider
      and external_source_id = archive_row.source_id
      and external_match_id = archive_row.external_match_id
    limit 1;
  end if;

  if target_id is null then
    select id
      into target_id
    from public.matches
    where phase_id = source_row.phase_id
      and least(home_team_id::text, away_team_id::text) = least(archive_row.mapped_home_team_id::text, archive_row.mapped_away_team_id::text)
      and greatest(home_team_id::text, away_team_id::text) = greatest(archive_row.mapped_home_team_id::text, archive_row.mapped_away_team_id::text)
      and (
        (scheduled_at is not null and archive_row.scheduled_at is not null and scheduled_at = archive_row.scheduled_at)
        or (
          round is not null
          and archive_row.round is not null
          and round = archive_row.round
        )
      )
    order by case when scheduled_at = archive_row.scheduled_at then 0 else 1 end
    limit 1;
  end if;

  insert into public.team_phases (team_id, phase_id)
  values
    (archive_row.mapped_home_team_id, source_row.phase_id),
    (archive_row.mapped_away_team_id, source_row.phase_id)
  on conflict (team_id, phase_id) do nothing;

  if target_id is null then
    insert into public.matches (
      phase_id,
      home_team_id,
      away_team_id,
      venue_id,
      referee_id,
      scheduled_at,
      date_tbd,
      round,
      status,
      home_score,
      away_score,
      external_provider,
      external_source_id,
      external_match_id,
      updated_at
    )
    values (
      source_row.phase_id,
      archive_row.mapped_home_team_id,
      archive_row.mapped_away_team_id,
      archive_row.venue_id,
      archive_row.referee_id,
      archive_row.scheduled_at,
      archive_row.scheduled_at is null,
      archive_row.round,
      case
        when archive_row.home_score is not null and archive_row.away_score is not null then coalesce(archive_row.status, 'finished')
        when archive_row.status = 'finished' then 'scheduled'
        else coalesce(archive_row.status, 'scheduled')
      end,
      archive_row.home_score,
      archive_row.away_score,
      source_row.provider,
      archive_row.source_id,
      archive_row.external_match_id,
      now()
    )
    returning id into target_id;
  else
    update public.matches
    set
      phase_id = source_row.phase_id,
      home_team_id = archive_row.mapped_home_team_id,
      away_team_id = archive_row.mapped_away_team_id,
      venue_id = archive_row.venue_id,
      referee_id = archive_row.referee_id,
      scheduled_at = archive_row.scheduled_at,
      date_tbd = archive_row.scheduled_at is null,
      round = archive_row.round,
      status = case
        when archive_row.home_score is not null and archive_row.away_score is not null then coalesce(archive_row.status, 'finished')
        when archive_row.status = 'finished' then 'scheduled'
        else coalesce(archive_row.status, status, 'scheduled')
      end,
      home_score = archive_row.home_score,
      away_score = archive_row.away_score,
      external_provider = source_row.provider,
      external_source_id = archive_row.source_id,
      external_match_id = archive_row.external_match_id,
      updated_at = now()
    where id = target_id;
  end if;

  update public.external_match_archive
  set
    computed_match_id = target_id,
    preferred_display = false,
    updated_at = now()
  where id = p_archive_id;

  return target_id;
end;
$$;

revoke all on function public.publish_external_match(uuid, uuid) from public;
grant execute on function public.publish_external_match(uuid, uuid) to authenticated;

create or replace function public.compute_external_match(
  p_archive_id uuid,
  p_target_match_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  archive_row public.external_match_archive%rowtype;
  source_row public.external_sources%rowtype;
  target_id uuid;
begin
  if not exists (
    select 1
    from public.admin_roles
    where user_id = auth.uid()
  ) then
    raise exception 'No autorizado';
  end if;

  select *
    into archive_row
  from public.external_match_archive
  where id = p_archive_id;

  if not found then
    raise exception 'Historico no encontrado';
  end if;

  select *
    into source_row
  from public.external_sources
  where id = archive_row.source_id;

  if not found then
    raise exception 'Fuente externa no encontrada';
  end if;

  if archive_row.mapped_home_team_id is null or archive_row.mapped_away_team_id is null then
    raise exception 'Falta mapear equipos';
  end if;

  if archive_row.scheduled_at is null then
    raise exception 'Falta fecha y hora';
  end if;

  if archive_row.home_score is null or archive_row.away_score is null then
    raise exception 'Falta resultado';
  end if;

  if coalesce(archive_row.review_status, 'pending') <> 'confirmed' then
    raise exception 'Primero confirma el historico';
  end if;

  target_id := public.publish_external_match(p_archive_id, p_target_match_id);

  update public.matches
  set
    status = 'finished',
    home_score = archive_row.home_score,
    away_score = archive_row.away_score,
    updated_at = now()
  where id = target_id;

  update public.external_match_archive
  set
    computed_match_id = target_id,
    computed_at = now(),
    computed_by = auth.uid(),
    preferred_display = false,
    review_status = 'confirmed',
    updated_at = now()
  where id = p_archive_id;

  return target_id;
end;
$$;

revoke all on function public.compute_external_match(uuid, uuid) from public;
grant execute on function public.compute_external_match(uuid, uuid) to authenticated;
