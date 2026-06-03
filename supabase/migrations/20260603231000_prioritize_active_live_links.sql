-- VMScore: si un partido tiene mas de una fuente vinculada, mostrar primero la fuente activa.

begin;

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
  coalesce(m.away_technical_director, at.technical_director) as away_technical_director,
  live.provider as live_provider,
  live.last_status as live_last_status,
  live.last_period as live_last_period,
  live.last_synced_at as live_last_synced_at,
  live.live_started_at,
  live.halftime_at as live_halftime_at,
  live.second_half_started_at as live_second_half_started_at,
  m.leg,
  l.leg_mode
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
left join lateral (
  select link.*
  from public.match_live_links link
  where link.match_id = m.id
    and link.enabled = true
  order by
    case when link.last_status in ('in_progress', 'paused', 'finished') then 0 else 1 end,
    case link.provider when 'copafacil' then 0 when 'locos_vm' then 1 else 2 end,
    link.updated_at desc
  limit 1
) live on true
where o.status = 'active'
  and l.approval_status = 'approved'
  and coalesce(l.is_archived, false) = false;

commit;
