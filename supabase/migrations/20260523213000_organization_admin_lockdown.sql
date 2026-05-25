-- VMScore: las fuentes externas y el contenido editorial quedan solo para superadmin.

drop policy if exists "admin gestiona fuentes externas" on public.external_sources;
create policy "superadmin gestiona fuentes externas"
on public.external_sources
for all
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists "admin gestiona mapeos externos" on public.external_team_mappings;
create policy "superadmin gestiona mapeos externos"
on public.external_team_mappings
for all
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists "admin gestiona archivo externo" on public.external_match_archive;
create policy "superadmin gestiona archivo externo"
on public.external_match_archive
for all
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists "admin gestiona capturas de scraping" on public.external_scrape_runs;
create policy "superadmin gestiona capturas de scraping"
on public.external_scrape_runs
for all
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists "escritura admin manual_scorers" on public.manual_scorers;
create policy "escritura superadmin manual_scorers"
on public.manual_scorers
for all
using (public.is_superadmin())
with check (public.is_superadmin());

drop policy if exists "escritura admin news" on public.news;
create policy "escritura superadmin news"
on public.news
for all
using (public.is_superadmin())
with check (public.is_superadmin());

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
    join public.teams ht on ht.id = matches.home_team_id
    join public.teams at on at.id = matches.away_team_id
    left join public.venues v on v.id = matches.venue_id
    left join public.referees r on r.id = matches.referee_id
    where p.id = matches.phase_id
      and public.can_manage_league(l.id)
      and l.approval_status = 'approved'
      and coalesce(l.is_archived, false) = false
      and ht.organization_id = l.organization_id
      and at.organization_id = l.organization_id
      and (matches.venue_id is null or v.organization_id = l.organization_id)
      and (matches.referee_id is null or r.organization_id = l.organization_id)
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
    join public.leagues l on l.id = p.league_id
    join public.teams t on t.id = team_phases.team_id
    where p.id = team_phases.phase_id
      and public.can_manage_league(l.id)
      and t.organization_id = l.organization_id
  )
);
