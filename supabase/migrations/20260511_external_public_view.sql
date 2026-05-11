-- VMScore: exponer historicos externos visibles sin publicar en matches.

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
left join public.phases p on p.id = es.phase_id
left join public.leagues l on l.id = es.league_id
left join public.sports sp on sp.id = l.sport_id
where a.review_status in ('confirmed', 'pending');
