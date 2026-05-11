-- VMScore: exponer datos de importacion y horarios a definir en v_matches.

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
join public.sports sp on l.sport_id = sp.id
left join public.venues v on m.venue_id = v.id
left join public.referees r on m.referee_id = r.id
left join public.groups g on m.group_id = g.id;
