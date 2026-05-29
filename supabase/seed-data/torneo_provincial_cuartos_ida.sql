-- Programacion de cuartos de final, partido de ida.
-- Fuente: imagen oficial enviada por administracion.

do $$
declare
  provincial_league_id constant uuid := 'ed6b11cb-bbca-4ad0-96e1-298b88d583a7';
  phase_cuartos constant uuid := 'cc4dcbd3-6c23-4272-90f3-9cc421e56c88';
  league_org_id uuid;
  rec record;
  existing_id uuid;
  venue_match_id uuid;
begin
  select organization_id
  into league_org_id
  from public.leagues
  where id = provincial_league_id;

  insert into public.venues (name, address, city, organization_id)
  select name, '', 'San Luis', league_org_id
  from (
    values
      ('Alianza - Candelaria'),
      ('Belgrano J. Daract'),
      ('SP Mercedes'),
      ('La Punta')
  ) as v(name)
  where not exists (
    select 1
    from public.venues existing
    where lower(trim(existing.name)) = lower(trim(v.name))
      and existing.organization_id = league_org_id
  );

  insert into public.league_teams (league_id, team_id)
  values
    (provincial_league_id, '48796b2d-bf7f-4b06-8aa3-afe74d466801'),
    (provincial_league_id, '4e709f54-4cc0-4058-be5c-a52710400ad8'),
    (provincial_league_id, '5198a500-423d-4110-8c9b-5c02ce0657c3'),
    (provincial_league_id, '1173f19e-269e-4635-aa44-2d7c152d4ab2'),
    (provincial_league_id, 'e20876b7-6fa3-4d58-b63e-2341501ffdc2'),
    (provincial_league_id, '8099c976-ddd4-448e-a165-c4f016d68c56'),
    (provincial_league_id, '137321f4-421a-47d3-9186-9c39c45dc9ab'),
    (provincial_league_id, '349ed249-9a67-419e-aaca-6039d1964184')
  on conflict (league_id, team_id) do nothing;

  insert into public.team_phases (team_id, phase_id, group_id)
  values
    ('48796b2d-bf7f-4b06-8aa3-afe74d466801', phase_cuartos, null),
    ('4e709f54-4cc0-4058-be5c-a52710400ad8', phase_cuartos, null),
    ('5198a500-423d-4110-8c9b-5c02ce0657c3', phase_cuartos, null),
    ('1173f19e-269e-4635-aa44-2d7c152d4ab2', phase_cuartos, null),
    ('e20876b7-6fa3-4d58-b63e-2341501ffdc2', phase_cuartos, null),
    ('8099c976-ddd4-448e-a165-c4f016d68c56', phase_cuartos, null),
    ('137321f4-421a-47d3-9186-9c39c45dc9ab', phase_cuartos, null),
    ('349ed249-9a67-419e-aaca-6039d1964184', phase_cuartos, null)
  on conflict (team_id, phase_id) do update set group_id = excluded.group_id;

  for rec in
    select *
    from (
      values
        ('137321f4-421a-47d3-9186-9c39c45dc9ab'::uuid, '349ed249-9a67-419e-aaca-6039d1964184'::uuid, '2026-05-30 16:00:00-03'::timestamptz, 'Alianza - Candelaria'),
        ('48796b2d-bf7f-4b06-8aa3-afe74d466801'::uuid, '4e709f54-4cc0-4058-be5c-a52710400ad8'::uuid, '2026-05-30 16:00:00-03'::timestamptz, 'Belgrano J. Daract'),
        ('e20876b7-6fa3-4d58-b63e-2341501ffdc2'::uuid, '8099c976-ddd4-448e-a165-c4f016d68c56'::uuid, '2026-05-31 16:00:00-03'::timestamptz, 'SP Mercedes'),
        ('5198a500-423d-4110-8c9b-5c02ce0657c3'::uuid, '1173f19e-269e-4635-aa44-2d7c152d4ab2'::uuid, '2026-05-31 16:00:00-03'::timestamptz, 'La Punta')
    ) as m(home_team_id, away_team_id, scheduled_at, venue_name)
  loop
    select id
    into venue_match_id
    from public.venues
    where lower(trim(name)) = lower(trim(rec.venue_name))
      and organization_id = league_org_id
    order by id
    limit 1;

    select id
    into existing_id
    from public.matches
    where phase_id = phase_cuartos
      and home_team_id = rec.home_team_id
      and away_team_id = rec.away_team_id
      and coalesce(leg, 1) = 1
    limit 1;

    if existing_id is null then
      insert into public.matches (
        phase_id,
        home_team_id,
        away_team_id,
        venue_id,
        scheduled_at,
        status,
        home_score,
        away_score,
        leg,
        notes
      )
      values (
        phase_cuartos,
        rec.home_team_id,
        rec.away_team_id,
        venue_match_id,
        rec.scheduled_at,
        'scheduled',
        null,
        null,
        1,
        'Cuartos de final ida Torneo Provincial 2026'
      );
    else
      update public.matches
      set scheduled_at = rec.scheduled_at,
          venue_id = venue_match_id,
          status = 'scheduled',
          home_score = null,
          away_score = null,
          leg = 1,
          notes = 'Cuartos de final ida Torneo Provincial 2026',
          updated_at = now()
      where id = existing_id;
    end if;
  end loop;
end $$;
