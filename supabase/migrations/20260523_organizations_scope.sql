-- VMScore: organizaciones, perimetro por ubicacion y archivo reversible.

create extension if not exists "uuid-ossp";

create table if not exists public.organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  city text not null,
  province text not null,
  country text not null default 'Argentina',
  logo_url text,
  status text not null default 'active',
  archived_at timestamptz,
  archived_by uuid,
  archive_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint organizations_status_check check (status in ('pending', 'active', 'archived', 'blocked'))
);

insert into public.organizations (name, slug, city, province, country, status)
values ('Villa Mercedes', 'villa-mercedes', 'Villa Mercedes', 'San Luis', 'Argentina', 'active')
on conflict (slug) do nothing;

alter table public.admin_roles
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists status text not null default 'active';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'admin_roles_status_check'
      and conrelid = 'public.admin_roles'::regclass
  ) then
    alter table public.admin_roles
      add constraint admin_roles_status_check
      check (status in ('active', 'blocked'))
      not valid;
  end if;

  begin
    alter table public.admin_roles validate constraint admin_roles_status_check;
  exception when others then null;
  end;
end $$;

alter table public.sports
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists is_archived boolean not null default false;

alter table public.teams
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists is_archived boolean not null default false;

alter table public.leagues
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists country text not null default 'Argentina',
  add column if not exists approval_status text not null default 'approved',
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid,
  add column if not exists archive_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leagues_approval_status_check'
      and conrelid = 'public.leagues'::regclass
  ) then
    alter table public.leagues
      add constraint leagues_approval_status_check
      check (approval_status in ('draft', 'pending_review', 'approved', 'rejected'))
      not valid;
  end if;

  begin
    alter table public.leagues validate constraint leagues_approval_status_check;
  exception when others then null;
  end;
end $$;

alter table public.venues
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists is_archived boolean not null default false;

alter table public.referees
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists is_archived boolean not null default false;

with vm as (
  select id from public.organizations where slug = 'villa-mercedes' limit 1
)
update public.leagues l
set organization_id = vm.id,
    city = coalesce(l.city, 'Villa Mercedes'),
    province = coalesce(l.province, 'San Luis'),
    country = coalesce(l.country, 'Argentina'),
    approval_status = coalesce(l.approval_status, 'approved')
from vm
where l.organization_id is null;

with vm as (
  select id from public.organizations where slug = 'villa-mercedes' limit 1
)
update public.teams t
set organization_id = vm.id
from vm
where t.organization_id is null;

with vm as (
  select id from public.organizations where slug = 'villa-mercedes' limit 1
)
update public.sports s
set organization_id = vm.id
from vm
where s.organization_id is null;

with vm as (
  select id from public.organizations where slug = 'villa-mercedes' limit 1
)
update public.venues v
set organization_id = vm.id
from vm
where v.organization_id is null;

with vm as (
  select id from public.organizations where slug = 'villa-mercedes' limit 1
)
update public.referees r
set organization_id = vm.id
from vm
where r.organization_id is null;

with vm as (
  select id from public.organizations where slug = 'villa-mercedes' limit 1
)
update public.admin_roles ar
set organization_id = coalesce(ar.organization_id, vm.id)
from vm
where ar.organization_id is null
  and ar.role <> 'superadmin';

alter table public.leagues
  alter column organization_id set not null,
  alter column city set not null,
  alter column province set not null;

create index if not exists admin_roles_user_org_idx on public.admin_roles(user_id, organization_id);
create index if not exists sports_organization_idx on public.sports(organization_id);
create index if not exists teams_organization_idx on public.teams(organization_id);
create index if not exists leagues_organization_idx on public.leagues(organization_id);
create index if not exists leagues_public_status_idx on public.leagues(organization_id, approval_status, is_archived, status);
create index if not exists venues_organization_idx on public.venues(organization_id);
create index if not exists referees_organization_idx on public.referees(organization_id);

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_roles ar
    where ar.user_id = auth.uid()
      and ar.role = 'superadmin'
      and coalesce(ar.status, 'active') = 'active'
  );
$$;

create or replace function public.can_manage_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin()
    or exists (
      select 1
      from public.admin_roles ar
      join public.organizations o on o.id = ar.organization_id
      where ar.user_id = auth.uid()
        and ar.organization_id = p_organization_id
        and ar.role in ('organization_admin', 'liga_admin')
        and coalesce(ar.status, 'active') = 'active'
        and o.status = 'active'
    );
$$;

create or replace function public.can_manage_league(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin()
    or exists (
      select 1
      from public.leagues l
      join public.admin_roles ar on ar.organization_id = l.organization_id
      join public.organizations o on o.id = l.organization_id
      where l.id = p_league_id
        and ar.user_id = auth.uid()
        and coalesce(ar.status, 'active') = 'active'
        and o.status = 'active'
        and (
          ar.role = 'organization_admin'
          or (ar.role = 'liga_admin' and (ar.league_id = l.id or ar.league_id is null))
        )
    );
$$;

create or replace function public.archive_organization(
  p_organization_id uuid,
  p_reason text default null
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

  update public.organizations
  set status = 'archived',
      archived_at = now(),
      archived_by = auth.uid(),
      archive_reason = p_reason,
      updated_at = now()
  where id = p_organization_id;
end;
$$;

create or replace function public.unarchive_organization(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'No autorizado';
  end if;

  update public.organizations
  set status = 'active',
      archived_at = null,
      archived_by = null,
      archive_reason = null,
      updated_at = now()
  where id = p_organization_id;
end;
$$;

create or replace function public.set_organization_blocked(
  p_organization_id uuid,
  p_blocked boolean
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

  update public.organizations
  set status = case when p_blocked then 'blocked' else 'active' end,
      updated_at = now()
  where id = p_organization_id;

  update public.admin_roles
  set status = case when p_blocked then 'blocked' else 'active' end
  where organization_id = p_organization_id
    and role <> 'superadmin';
end;
$$;

create or replace function public.archive_league(
  p_league_id uuid,
  p_reason text default null
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

  update public.leagues
  set is_archived = true,
      archived_at = now(),
      archived_by = auth.uid(),
      archive_reason = p_reason
  where id = p_league_id;
end;
$$;

create or replace function public.unarchive_league(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'No autorizado';
  end if;

  update public.leagues
  set is_archived = false,
      archived_at = null,
      archived_by = null,
      archive_reason = null
  where id = p_league_id;
end;
$$;

create or replace function public.approve_league(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_superadmin() then
    raise exception 'No autorizado';
  end if;

  update public.leagues
  set approval_status = 'approved',
      is_archived = false
  where id = p_league_id;
end;
$$;

revoke all on function public.archive_organization(uuid, text) from public;
revoke all on function public.unarchive_organization(uuid) from public;
revoke all on function public.set_organization_blocked(uuid, boolean) from public;
revoke all on function public.archive_league(uuid, text) from public;
revoke all on function public.unarchive_league(uuid) from public;
revoke all on function public.approve_league(uuid) from public;

grant execute on function public.archive_organization(uuid, text) to authenticated;
grant execute on function public.unarchive_organization(uuid) to authenticated;
grant execute on function public.set_organization_blocked(uuid, boolean) to authenticated;
grant execute on function public.archive_league(uuid, text) to authenticated;
grant execute on function public.unarchive_league(uuid) to authenticated;
grant execute on function public.approve_league(uuid) to authenticated;

alter table public.organizations enable row level security;

drop policy if exists "lectura publica organizations" on public.organizations;
create policy "lectura publica organizations"
on public.organizations
for select
using (
  status = 'active'
  or public.can_manage_organization(id)
);

drop policy if exists "superadmin gestiona organizations" on public.organizations;
create policy "superadmin gestiona organizations"
on public.organizations
for all
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists "lectura publica leagues" on public.leagues;
create policy "lectura publica leagues"
on public.leagues
for select
using (
  (
    approval_status = 'approved'
    and coalesce(is_archived, false) = false
    and exists (
      select 1
      from public.organizations o
      where o.id = leagues.organization_id
        and o.status = 'active'
    )
  )
  or public.can_manage_organization(organization_id)
);

drop policy if exists "escritura admin leagues" on public.leagues;
create policy "escritura admin leagues"
on public.leagues
for all
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists "lectura publica teams" on public.teams;
create policy "lectura publica teams"
on public.teams
for select
using (
  (
    coalesce(is_archived, false) = false
    and exists (
      select 1
      from public.organizations o
      where o.id = teams.organization_id
        and o.status = 'active'
    )
  )
  or public.can_manage_organization(organization_id)
);

drop policy if exists "escritura admin teams" on public.teams;
create policy "escritura admin teams"
on public.teams
for all
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists "lectura publica sports" on public.sports;
create policy "lectura publica sports"
on public.sports
for select
using (
  (
    coalesce(is_archived, false) = false
    and exists (
      select 1
      from public.organizations o
      where o.id = sports.organization_id
        and o.status = 'active'
    )
  )
  or public.can_manage_organization(organization_id)
);

drop policy if exists "escritura admin sports" on public.sports;
create policy "escritura admin sports"
on public.sports
for all
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists "lectura publica venues" on public.venues;
create policy "lectura publica venues"
on public.venues
for select
using (
  (
    coalesce(is_archived, false) = false
    and exists (
      select 1
      from public.organizations o
      where o.id = venues.organization_id
        and o.status = 'active'
    )
  )
  or public.can_manage_organization(organization_id)
);

drop policy if exists "escritura admin venues" on public.venues;
create policy "escritura admin venues"
on public.venues
for all
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists "lectura publica referees" on public.referees;
create policy "lectura publica referees"
on public.referees
for select
using (
  (
    coalesce(is_archived, false) = false
    and exists (
      select 1
      from public.organizations o
      where o.id = referees.organization_id
        and o.status = 'active'
    )
  )
  or public.can_manage_organization(organization_id)
);

drop policy if exists "escritura admin referees" on public.referees;
create policy "escritura admin referees"
on public.referees
for all
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists "lectura publica phases" on public.phases;
create policy "lectura publica phases"
on public.phases
for select
using (
  exists (
    select 1
    from public.leagues l
    join public.organizations o on o.id = l.organization_id
    where l.id = phases.league_id
      and o.status = 'active'
      and l.approval_status = 'approved'
      and coalesce(l.is_archived, false) = false
  )
  or public.can_manage_league(league_id)
);

drop policy if exists "escritura admin phases" on public.phases;
create policy "escritura admin phases"
on public.phases
for all
using (public.can_manage_league(league_id))
with check (public.can_manage_league(league_id));

drop policy if exists "lectura publica groups" on public.groups;
create policy "lectura publica groups"
on public.groups
for select
using (
  exists (
    select 1
    from public.phases p
    join public.leagues l on l.id = p.league_id
    join public.organizations o on o.id = l.organization_id
    where p.id = groups.phase_id
      and o.status = 'active'
      and l.approval_status = 'approved'
      and coalesce(l.is_archived, false) = false
  )
  or exists (
    select 1
    from public.phases p
    where p.id = groups.phase_id
      and public.can_manage_league(p.league_id)
  )
);

drop policy if exists "escritura admin groups" on public.groups;
create policy "escritura admin groups"
on public.groups
for all
using (
  exists (
    select 1
    from public.phases p
    where p.id = groups.phase_id
      and public.can_manage_league(p.league_id)
  )
)
with check (
  exists (
    select 1
    from public.phases p
    where p.id = groups.phase_id
      and public.can_manage_league(p.league_id)
  )
);

drop policy if exists "lectura publica matches" on public.matches;
create policy "lectura publica matches"
on public.matches
for select
using (
  exists (
    select 1
    from public.phases p
    join public.leagues l on l.id = p.league_id
    join public.organizations o on o.id = l.organization_id
    where p.id = matches.phase_id
      and o.status = 'active'
      and l.approval_status = 'approved'
      and coalesce(l.is_archived, false) = false
  )
  or exists (
    select 1
    from public.phases p
    where p.id = matches.phase_id
      and public.can_manage_league(p.league_id)
  )
);

drop policy if exists "club_admin actualiza resultado de sus partidos" on public.matches;
drop policy if exists "escritura admin matches" on public.matches;
create policy "escritura admin matches"
on public.matches
for all
using (
  exists (
    select 1
    from public.phases p
    where p.id = matches.phase_id
      and public.can_manage_league(p.league_id)
  )
)
with check (
  exists (
    select 1
    from public.phases p
    where p.id = matches.phase_id
      and public.can_manage_league(p.league_id)
  )
);

drop policy if exists "lectura publica standings" on public.standings;
create policy "lectura publica standings"
on public.standings
for select
using (
  exists (
    select 1
    from public.phases p
    join public.leagues l on l.id = p.league_id
    join public.organizations o on o.id = l.organization_id
    where p.id = standings.phase_id
      and o.status = 'active'
      and l.approval_status = 'approved'
      and coalesce(l.is_archived, false) = false
  )
  or exists (
    select 1
    from public.phases p
    where p.id = standings.phase_id
      and public.can_manage_league(p.league_id)
  )
);

drop policy if exists "escritura admin standings" on public.standings;
create policy "escritura admin standings"
on public.standings
for all
using (
  exists (
    select 1
    from public.phases p
    where p.id = standings.phase_id
      and public.can_manage_league(p.league_id)
  )
)
with check (
  exists (
    select 1
    from public.phases p
    where p.id = standings.phase_id
      and public.can_manage_league(p.league_id)
  )
);

drop policy if exists "lectura publica team_phases" on public.team_phases;
create policy "lectura publica team_phases"
on public.team_phases
for select
using (
  exists (
    select 1
    from public.phases p
    join public.leagues l on l.id = p.league_id
    join public.organizations o on o.id = l.organization_id
    where p.id = team_phases.phase_id
      and o.status = 'active'
      and l.approval_status = 'approved'
      and coalesce(l.is_archived, false) = false
  )
  or exists (
    select 1
    from public.phases p
    where p.id = team_phases.phase_id
      and public.can_manage_league(p.league_id)
  )
);

drop policy if exists "escritura admin team_phases" on public.team_phases;
create policy "escritura admin team_phases"
on public.team_phases
for all
using (
  exists (
    select 1
    from public.phases p
    where p.id = team_phases.phase_id
      and public.can_manage_league(p.league_id)
  )
)
with check (
  exists (
    select 1
    from public.phases p
    where p.id = team_phases.phase_id
      and public.can_manage_league(p.league_id)
  )
);

drop policy if exists "lectura publica players" on public.players;
create policy "lectura publica players"
on public.players
for select
using (
  exists (
    select 1
    from public.teams t
    join public.organizations o on o.id = t.organization_id
    where t.id = players.team_id
      and o.status = 'active'
      and coalesce(t.is_archived, false) = false
  )
  or exists (
    select 1
    from public.teams t
    where t.id = players.team_id
      and public.can_manage_organization(t.organization_id)
  )
);

drop policy if exists "escritura admin players" on public.players;
create policy "escritura admin players"
on public.players
for all
using (
  exists (
    select 1
    from public.teams t
    where t.id = players.team_id
      and public.can_manage_organization(t.organization_id)
  )
)
with check (
  exists (
    select 1
    from public.teams t
    where t.id = players.team_id
      and public.can_manage_organization(t.organization_id)
  )
);

drop policy if exists "lectura publica staff_members" on public.staff_members;
create policy "lectura publica staff_members"
on public.staff_members
for select
using (
  exists (
    select 1
    from public.teams t
    join public.organizations o on o.id = t.organization_id
    where t.id = staff_members.team_id
      and o.status = 'active'
      and coalesce(t.is_archived, false) = false
  )
  or exists (
    select 1
    from public.teams t
    where t.id = staff_members.team_id
      and public.can_manage_organization(t.organization_id)
  )
);

drop policy if exists "escritura admin staff_members" on public.staff_members;
create policy "escritura admin staff_members"
on public.staff_members
for all
using (
  exists (
    select 1
    from public.teams t
    where t.id = staff_members.team_id
      and public.can_manage_organization(t.organization_id)
  )
)
with check (
  exists (
    select 1
    from public.teams t
    where t.id = staff_members.team_id
      and public.can_manage_organization(t.organization_id)
  )
);

drop policy if exists "lectura publica league_teams" on public.league_teams;
create policy "lectura publica league_teams"
on public.league_teams
for select
using (
  exists (
    select 1
    from public.leagues l
    join public.organizations o on o.id = l.organization_id
    where l.id = league_teams.league_id
      and o.status = 'active'
      and l.approval_status = 'approved'
      and coalesce(l.is_archived, false) = false
  )
  or public.can_manage_league(league_id)
);

drop policy if exists "escritura admin league_teams" on public.league_teams;
create policy "escritura admin league_teams"
on public.league_teams
for all
using (public.can_manage_league(league_id))
with check (
  public.can_manage_league(league_id)
  and exists (
    select 1
    from public.leagues l
    join public.teams t on t.id = league_teams.team_id
    where l.id = league_teams.league_id
      and t.organization_id = l.organization_id
  )
);

drop policy if exists "lectura publica match_lineups" on public.match_lineups;
create policy "lectura publica match_lineups"
on public.match_lineups
for select
using (
  exists (
    select 1
    from public.matches m
    join public.phases p on p.id = m.phase_id
    join public.leagues l on l.id = p.league_id
    join public.organizations o on o.id = l.organization_id
    where m.id = match_lineups.match_id
      and o.status = 'active'
      and l.approval_status = 'approved'
      and coalesce(l.is_archived, false) = false
  )
  or exists (
    select 1
    from public.matches m
    join public.phases p on p.id = m.phase_id
    where m.id = match_lineups.match_id
      and public.can_manage_league(p.league_id)
  )
);

drop policy if exists "escritura admin match_lineups" on public.match_lineups;
create policy "escritura admin match_lineups"
on public.match_lineups
for all
using (
  exists (
    select 1
    from public.matches m
    join public.phases p on p.id = m.phase_id
    where m.id = match_lineups.match_id
      and public.can_manage_league(p.league_id)
  )
)
with check (
  exists (
    select 1
    from public.matches m
    join public.phases p on p.id = m.phase_id
    where m.id = match_lineups.match_id
      and public.can_manage_league(p.league_id)
  )
);

drop policy if exists "lectura publica match_staff" on public.match_staff;
create policy "lectura publica match_staff"
on public.match_staff
for select
using (
  exists (
    select 1
    from public.matches m
    join public.phases p on p.id = m.phase_id
    join public.leagues l on l.id = p.league_id
    join public.organizations o on o.id = l.organization_id
    where m.id = match_staff.match_id
      and o.status = 'active'
      and l.approval_status = 'approved'
      and coalesce(l.is_archived, false) = false
  )
  or exists (
    select 1
    from public.matches m
    join public.phases p on p.id = m.phase_id
    where m.id = match_staff.match_id
      and public.can_manage_league(p.league_id)
  )
);

drop policy if exists "escritura admin match_staff" on public.match_staff;
create policy "escritura admin match_staff"
on public.match_staff
for all
using (
  exists (
    select 1
    from public.matches m
    join public.phases p on p.id = m.phase_id
    where m.id = match_staff.match_id
      and public.can_manage_league(p.league_id)
  )
)
with check (
  exists (
    select 1
    from public.matches m
    join public.phases p on p.id = m.phase_id
    where m.id = match_staff.match_id
      and public.can_manage_league(p.league_id)
  )
);

drop policy if exists "lectura publica match_events" on public.match_events;
create policy "lectura publica match_events"
on public.match_events
for select
using (
  exists (
    select 1
    from public.matches m
    join public.phases p on p.id = m.phase_id
    join public.leagues l on l.id = p.league_id
    join public.organizations o on o.id = l.organization_id
    where m.id = match_events.match_id
      and o.status = 'active'
      and l.approval_status = 'approved'
      and coalesce(l.is_archived, false) = false
  )
  or exists (
    select 1
    from public.matches m
    join public.phases p on p.id = m.phase_id
    where m.id = match_events.match_id
      and public.can_manage_league(p.league_id)
  )
);

drop policy if exists "club_admin inserta eventos de su equipo" on public.match_events;
drop policy if exists "escritura admin match_events" on public.match_events;
create policy "escritura admin match_events"
on public.match_events
for all
using (
  exists (
    select 1
    from public.matches m
    join public.phases p on p.id = m.phase_id
    where m.id = match_events.match_id
      and public.can_manage_league(p.league_id)
  )
)
with check (
  exists (
    select 1
    from public.matches m
    join public.phases p on p.id = m.phase_id
    where m.id = match_events.match_id
      and public.can_manage_league(p.league_id)
  )
);

drop view if exists public.v_matches;
drop view if exists public.v_standings;

create view public.v_matches as
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
  m.external_match_id
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

create view public.v_standings as
select
  s.id,
  s.phase_id,
  s.group_id,
  s.team_id,
  t.name as team_name,
  t.short_name as team_short_name,
  t.logo_url as team_logo_url,
  t.primary_color,
  t.secondary_color,
  g.name as group_name,
  p.name as phase_name,
  p.league_id,
  l.name as league_name,
  l.gender,
  l.organization_id,
  o.name as organization_name,
  o.slug as organization_slug,
  o.city as organization_city,
  o.province as organization_province,
  l.approval_status as league_approval_status,
  l.is_archived as league_is_archived,
  o.status as organization_status,
  s.played,
  s.won,
  s.drawn,
  s.lost,
  s.goals_for,
  s.goals_against,
  s.goal_diff,
  s.points,
  s.yellow_cards,
  s.red_cards,
  s."position",
  s.base_played,
  s.base_won,
  s.base_drawn,
  s.base_lost,
  s.base_goals_for,
  s.base_goals_against,
  s.base_points
from public.standings s
join public.teams t on s.team_id = t.id
join public.phases p on s.phase_id = p.id
join public.leagues l on p.league_id = l.id
join public.organizations o on o.id = l.organization_id
left join public.groups g on s.group_id = g.id
where o.status = 'active'
  and l.approval_status = 'approved'
  and coalesce(l.is_archived, false) = false
order by s.phase_id, s.group_id, s."position";
