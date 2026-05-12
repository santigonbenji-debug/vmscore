-- VMScore: computar manualmente partidos externos en la tabla oficial.

alter table public.external_match_archive
  add column if not exists computed_match_id uuid references public.matches(id) on delete set null,
  add column if not exists computed_at timestamptz,
  add column if not exists computed_by uuid;

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
        scheduled_at = archive_row.scheduled_at
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
      archive_row.scheduled_at,
      false,
      archive_row.round,
      'finished',
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
      scheduled_at = archive_row.scheduled_at,
      date_tbd = false,
      round = archive_row.round,
      status = 'finished',
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
