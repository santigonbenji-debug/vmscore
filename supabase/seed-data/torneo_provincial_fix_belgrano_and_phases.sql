-- Correcciones Torneo Provincial 2026:
-- - El equipo correcto es Belgrano JD, no Deportivo Belgrano.
-- - La primera llave cargada corresponde a Octavos de final.
-- - Se elimina la fase vacia que duplicaba "Octavos de final".

do $$
declare
  provincial_league_id constant uuid := 'ed6b11cb-bbca-4ad0-96e1-298b88d583a7';
  phase_octavos constant uuid := '5c17befd-e398-46f2-b312-7dfced61d0bf';
  empty_octavos_phase constant uuid := 'd41717ff-c703-490a-83ad-9ee1195686f4';
  phase_cuartos constant uuid := 'cc4dcbd3-6c23-4272-90f3-9cc421e56c88';
  phase_semifinal constant uuid := 'd70ba999-4b3c-47c6-94c0-3dbb67702eeb';
  phase_final constant uuid := '60ad1cdc-912f-47c8-9162-91c1412b4c90';
  belgrano_jd constant uuid := '48796b2d-bf7f-4b06-8aa3-afe74d466801';
  belgrano_incorrecto constant uuid := '13784493-7982-4706-a756-4e749967ea01';
begin
  update public.teams
  set name = 'Belgrano JD',
      short_name = 'Belgrano JD'
  where id = belgrano_jd;

  update public.phases
  set name = 'Octavos de final',
      phase_order = 1
  where id = phase_octavos;

  delete from public.team_phases
  where phase_id = empty_octavos_phase;

  delete from public.phases
  where id = empty_octavos_phase
    and not exists (
      select 1 from public.matches where phase_id = empty_octavos_phase
    );

  update public.phases set phase_order = 2 where id = phase_cuartos;
  update public.phases set phase_order = 3 where id = phase_semifinal;
  update public.phases set phase_order = 4 where id = phase_final;

  insert into public.league_teams (league_id, team_id)
  values (provincial_league_id, belgrano_jd)
  on conflict (league_id, team_id) do nothing;

  insert into public.team_phases (team_id, phase_id, group_id)
  values
    (belgrano_jd, phase_octavos, null),
    (belgrano_jd, phase_cuartos, null)
  on conflict (team_id, phase_id) do update set group_id = excluded.group_id;

  update public.matches
  set home_team_id = belgrano_jd,
      updated_at = now()
  where home_team_id = belgrano_incorrecto
    and phase_id in (phase_octavos, phase_cuartos);

  update public.matches
  set away_team_id = belgrano_jd,
      updated_at = now()
  where away_team_id = belgrano_incorrecto
    and phase_id in (phase_octavos, phase_cuartos);

  delete from public.team_phases
  where team_id = belgrano_incorrecto
    and phase_id in (phase_octavos, phase_cuartos);

  delete from public.league_teams
  where league_id = provincial_league_id
    and team_id = belgrano_incorrecto
    and not exists (
      select 1
      from public.matches m
      join public.phases p on p.id = m.phase_id
      where p.league_id = provincial_league_id
        and (m.home_team_id = belgrano_incorrecto or m.away_team_id = belgrano_incorrecto)
    );
end $$;
