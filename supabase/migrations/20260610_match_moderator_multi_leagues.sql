-- Moderadores con multiples ligas y suspension total.

create or replace function public.list_match_moderators()
returns table (
  user_id uuid,
  email text,
  display_name text,
  league_ids uuid[],
  league_names text,
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
    max(ar.email) as email,
    max(ar.display_name) as display_name,
    array_agg(ar.league_id order by l.name) filter (where ar.league_id is not null) as league_ids,
    string_agg(l.name, ', ' order by l.name) as league_names,
    case
      when bool_or(coalesce(ar.status, 'active') = 'active') then 'active'
      else 'blocked'
    end as status,
    min(ar.created_at) as created_at
  from public.admin_roles ar
  left join public.leagues l on l.id = ar.league_id
  where ar.role = 'match_moderator'
  group by ar.user_id
  order by coalesce(max(ar.display_name), max(ar.email));
end;
$$;

create or replace function public.set_match_moderator_leagues(
  p_user_id uuid,
  p_league_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_display_name text;
  v_status text;
  v_league_id uuid;
  v_valid_count integer;
begin
  if not public.is_superadmin() then
    raise exception 'No autorizado';
  end if;

  if p_league_ids is null or cardinality(p_league_ids) = 0 then
    raise exception 'El moderador debe tener al menos una liga asignada';
  end if;

  select count(*)
  into v_valid_count
  from public.leagues l
  join public.organizations o on o.id = l.organization_id
  where l.id = any(p_league_ids)
    and l.approval_status = 'approved'
    and coalesce(l.is_archived, false) = false
    and o.status = 'active';

  if v_valid_count <> cardinality(p_league_ids) then
    raise exception 'Todas las ligas asignadas deben estar activas y aprobadas';
  end if;

  select max(email), max(display_name),
    case when bool_or(coalesce(status, 'active') = 'active') then 'active' else 'blocked' end
  into v_email, v_display_name, v_status
  from public.admin_roles
  where user_id = p_user_id
    and role = 'match_moderator';

  if v_email is null then
    raise exception 'Moderador no encontrado';
  end if;

  delete from public.admin_roles
  where user_id = p_user_id
    and role = 'match_moderator'
    and (league_id is null or not (league_id = any(p_league_ids)));

  foreach v_league_id in array p_league_ids loop
    if not exists (
      select 1
      from public.admin_roles
      where user_id = p_user_id
        and role = 'match_moderator'
        and league_id = v_league_id
    ) then
      insert into public.admin_roles (
        user_id,
        role,
        league_id,
        email,
        display_name,
        status
      )
      values (
        p_user_id,
        'match_moderator',
        v_league_id,
        v_email,
        v_display_name,
        coalesce(v_status, 'active')
      );
    end if;
  end loop;
end;
$$;

create or replace function public.list_my_moderator_leagues()
returns table (
  id uuid,
  name text,
  season text,
  year integer,
  gender text,
  organization_id uuid,
  organization_name text,
  organization_city text,
  organization_province text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct
    l.id,
    l.name,
    l.season,
    l.year,
    l.gender,
    l.organization_id,
    o.name as organization_name,
    o.city as organization_city,
    o.province as organization_province
  from public.admin_roles ar
  join public.leagues l on l.id = ar.league_id
  join public.organizations o on o.id = l.organization_id
  where ar.user_id = auth.uid()
    and ar.role = 'match_moderator'
    and coalesce(ar.status, 'active') = 'active'
    and l.approval_status = 'approved'
    and coalesce(l.is_archived, false) = false
    and o.status = 'active'
  order by o.city, l.name;
$$;

revoke all on function public.set_match_moderator_leagues(uuid, uuid[]) from public;
revoke all on function public.list_my_moderator_leagues() from public;
grant execute on function public.set_match_moderator_leagues(uuid, uuid[]) to authenticated;
grant execute on function public.list_my_moderator_leagues() to authenticated;
