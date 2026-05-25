-- VMScore: integridad estricta del perimetro de organizaciones.

alter table public.sports alter column organization_id set not null;
alter table public.teams alter column organization_id set not null;
alter table public.venues alter column organization_id set not null;
alter table public.referees alter column organization_id set not null;

alter table public.sports drop constraint if exists sports_slug_key;
drop index if exists public.sports_slug_key;
create unique index if not exists sports_organization_slug_key
  on public.sports (organization_id, slug);

drop policy if exists "escritura admin teams" on public.teams;
create policy "escritura admin teams"
on public.teams
for all
using (public.can_manage_organization(organization_id))
with check (
  public.can_manage_organization(organization_id)
  and exists (
    select 1
    from public.sports sp
    where sp.id = teams.sport_id
      and sp.organization_id = teams.organization_id
  )
  and (
    teams.home_venue_id is null
    or exists (
      select 1
      from public.venues v
      where v.id = teams.home_venue_id
        and v.organization_id = teams.organization_id
    )
  )
);

drop policy if exists "escritura admin leagues" on public.leagues;
create policy "escritura admin leagues"
on public.leagues
for all
using (public.can_manage_organization(organization_id))
with check (
  public.can_manage_organization(organization_id)
  and exists (
    select 1
    from public.sports sp
    where sp.id = leagues.sport_id
      and sp.organization_id = leagues.organization_id
  )
  and (
    leagues.champion_team_id is null
    or exists (
      select 1
      from public.teams t
      where t.id = leagues.champion_team_id
        and t.organization_id = leagues.organization_id
    )
  )
);

create or replace function public.enforce_league_organization_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org public.organizations%rowtype;
begin
  select *
  into org
  from public.organizations
  where id = new.organization_id;

  if not found then
    raise exception 'Organizacion invalida';
  end if;

  new.city := org.city;
  new.province := org.province;
  new.country := org.country;

  if not public.is_superadmin() then
    if tg_op = 'INSERT' and new.approval_status not in ('draft', 'pending_review') then
      raise exception 'La liga debe ser aprobada por el superadmin';
    end if;
    if tg_op = 'UPDATE' and new.approval_status is distinct from old.approval_status then
      raise exception 'Solo el superadmin puede cambiar la aprobacion';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_league_organization_scope on public.leagues;
create trigger enforce_league_organization_scope
before insert or update on public.leagues
for each row execute function public.enforce_league_organization_scope();
