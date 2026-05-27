begin;

drop policy if exists "escritura admin league_teams" on public.league_teams;
create policy "escritura admin league_teams"
on public.league_teams
for all
using (public.can_manage_league(league_id))
with check (
  public.can_manage_league(league_id)
  and (
    public.is_superadmin()
    or exists (
      select 1
      from public.leagues l
      join public.teams t on t.id = league_teams.team_id
      where l.id = league_teams.league_id
        and t.organization_id = l.organization_id
    )
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
    join public.league_teams lt
      on lt.league_id = p.league_id
     and lt.team_id = team_phases.team_id
    where p.id = team_phases.phase_id
      and public.can_manage_league(p.league_id)
  )
);

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
    join public.leagues l on l.id = p.league_id
    left join public.venues v on v.id = matches.venue_id
    left join public.referees r on r.id = matches.referee_id
    where p.id = matches.phase_id
      and public.can_manage_league(l.id)
      and l.approval_status = 'approved'
      and coalesce(l.is_archived, false) = false
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

commit;
