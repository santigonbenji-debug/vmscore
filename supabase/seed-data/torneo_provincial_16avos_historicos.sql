-- Datos historicos del Torneo Provincial 2026, primera llave ida/vuelta.
-- Fuente: imagenes enviadas por administracion.

do $$
declare
  phase_16avos uuid := '5c17befd-e398-46f2-b312-7dfced61d0bf';
  league_org_id uuid;
  rec record;
  existing_id uuid;
  venue_match_id uuid;
begin
  select organization_id
  into league_org_id
  from public.leagues
  where id = 'ed6b11cb-bbca-4ad0-96e1-298b88d583a7';

  insert into public.venues (name, address, city, organization_id)
  select name, '', 'San Luis', league_org_id
  from (
    values
      ('Bartolome Palma (Candelaria)'),
      ('El Panoramico'),
      ('Celestino Gatica (Quines)'),
      ('Predio Naranja'),
      ('Osvaldo Centioni'),
      ('Miguel Catuogno'),
      ('Juventud Carpinteria'),
      ('Dep. Naschel'),
      ('Alianza - Candelaria'),
      ('E.F.I. Juniors'),
      ('El Chorrillo'),
      ('Cryder Merlo'),
      ('San Francisco'),
      ('Atletico Concaran'),
      ('Colegiales V.M.'),
      ('Belgrano J. Daract')
  ) as v(name)
  where not exists (
    select 1 from public.venues existing
    where lower(trim(existing.name)) = lower(trim(v.name))
      and existing.organization_id = league_org_id
  );

  insert into public.team_phases (team_id, phase_id, group_id)
  values
    ('137321f4-421a-47d3-9186-9c39c45dc9ab', phase_16avos, null),
    ('345876b9-2541-4e62-96c7-39d6fe78502c', phase_16avos, null),
    ('8099c976-ddd4-448e-a165-c4f016d68c56', phase_16avos, null),
    ('8ff76084-2fdb-4109-ba7a-3c2b0b93ffb2', phase_16avos, null),
    ('926c9fb3-2b01-4dd4-bbcd-014abdb24ba6', phase_16avos, null),
    ('4e709f54-4cc0-4058-be5c-a52710400ad8', phase_16avos, null),
    ('5198a500-423d-4110-8c9b-5c02ce0657c3', phase_16avos, null),
    ('7eb88de9-cb19-4284-be3e-d2165dc72528', phase_16avos, null),
    ('1173f19e-269e-4635-aa44-2d7c152d4ab2', phase_16avos, null),
    ('6e11f84a-c332-4b2b-a3b9-56ace65cad86', phase_16avos, null),
    ('e20876b7-6fa3-4d58-b63e-2341501ffdc2', phase_16avos, null),
    ('0c250862-2f63-4e40-bd1d-480a097a9362', phase_16avos, null),
    ('80d87c32-d07b-4ca0-b97a-12f2f491217a', phase_16avos, null),
    ('349ed249-9a67-419e-aaca-6039d1964184', phase_16avos, null),
    ('c5f09151-df20-44f2-bdfe-25135584149c', phase_16avos, null),
    ('13784493-7982-4706-a756-4e749967ea01', phase_16avos, null)
  on conflict (team_id, phase_id) do update set group_id = excluded.group_id;

  insert into public.league_teams (league_id, team_id)
  values
    ('ed6b11cb-bbca-4ad0-96e1-298b88d583a7', '137321f4-421a-47d3-9186-9c39c45dc9ab'),
    ('ed6b11cb-bbca-4ad0-96e1-298b88d583a7', '345876b9-2541-4e62-96c7-39d6fe78502c'),
    ('ed6b11cb-bbca-4ad0-96e1-298b88d583a7', '8099c976-ddd4-448e-a165-c4f016d68c56'),
    ('ed6b11cb-bbca-4ad0-96e1-298b88d583a7', '8ff76084-2fdb-4109-ba7a-3c2b0b93ffb2'),
    ('ed6b11cb-bbca-4ad0-96e1-298b88d583a7', '926c9fb3-2b01-4dd4-bbcd-014abdb24ba6'),
    ('ed6b11cb-bbca-4ad0-96e1-298b88d583a7', '4e709f54-4cc0-4058-be5c-a52710400ad8'),
    ('ed6b11cb-bbca-4ad0-96e1-298b88d583a7', '5198a500-423d-4110-8c9b-5c02ce0657c3'),
    ('ed6b11cb-bbca-4ad0-96e1-298b88d583a7', '7eb88de9-cb19-4284-be3e-d2165dc72528'),
    ('ed6b11cb-bbca-4ad0-96e1-298b88d583a7', '1173f19e-269e-4635-aa44-2d7c152d4ab2'),
    ('ed6b11cb-bbca-4ad0-96e1-298b88d583a7', '6e11f84a-c332-4b2b-a3b9-56ace65cad86'),
    ('ed6b11cb-bbca-4ad0-96e1-298b88d583a7', 'e20876b7-6fa3-4d58-b63e-2341501ffdc2'),
    ('ed6b11cb-bbca-4ad0-96e1-298b88d583a7', '0c250862-2f63-4e40-bd1d-480a097a9362'),
    ('ed6b11cb-bbca-4ad0-96e1-298b88d583a7', '80d87c32-d07b-4ca0-b97a-12f2f491217a'),
    ('ed6b11cb-bbca-4ad0-96e1-298b88d583a7', '349ed249-9a67-419e-aaca-6039d1964184'),
    ('ed6b11cb-bbca-4ad0-96e1-298b88d583a7', 'c5f09151-df20-44f2-bdfe-25135584149c'),
    ('ed6b11cb-bbca-4ad0-96e1-298b88d583a7', '13784493-7982-4706-a756-4e749967ea01')
  on conflict (league_id, team_id) do nothing;

  for rec in
    select *
    from (
      values
        ('137321f4-421a-47d3-9186-9c39c45dc9ab'::uuid, '345876b9-2541-4e62-96c7-39d6fe78502c'::uuid, '2026-04-25 16:30:00-03'::timestamptz, 1, 1, 1, 'Bartolome Palma (Candelaria)'),
        ('8099c976-ddd4-448e-a165-c4f016d68c56'::uuid, '8ff76084-2fdb-4109-ba7a-3c2b0b93ffb2'::uuid, '2026-04-25 16:30:00-03'::timestamptz, 1, 1, 0, 'El Panoramico'),
        ('926c9fb3-2b01-4dd4-bbcd-014abdb24ba6'::uuid, '4e709f54-4cc0-4058-be5c-a52710400ad8'::uuid, '2026-04-26 16:30:00-03'::timestamptz, 1, 0, 0, 'Celestino Gatica (Quines)'),
        ('5198a500-423d-4110-8c9b-5c02ce0657c3'::uuid, '7eb88de9-cb19-4284-be3e-d2165dc72528'::uuid, '2026-04-26 16:30:00-03'::timestamptz, 1, 3, 0, 'Predio Naranja'),
        ('1173f19e-269e-4635-aa44-2d7c152d4ab2'::uuid, '6e11f84a-c332-4b2b-a3b9-56ace65cad86'::uuid, '2026-04-26 16:30:00-03'::timestamptz, 1, 5, 0, 'Osvaldo Centioni'),
        ('e20876b7-6fa3-4d58-b63e-2341501ffdc2'::uuid, '0c250862-2f63-4e40-bd1d-480a097a9362'::uuid, '2026-04-26 16:30:00-03'::timestamptz, 1, 2, 0, 'Miguel Catuogno'),
        ('80d87c32-d07b-4ca0-b97a-12f2f491217a'::uuid, '349ed249-9a67-419e-aaca-6039d1964184'::uuid, '2026-04-26 16:30:00-03'::timestamptz, 1, 1, 1, 'Juventud Carpinteria'),
        ('c5f09151-df20-44f2-bdfe-25135584149c'::uuid, '13784493-7982-4706-a756-4e749967ea01'::uuid, '2026-04-26 17:00:00-03'::timestamptz, 1, 0, 1, 'Dep. Naschel'),
        ('345876b9-2541-4e62-96c7-39d6fe78502c'::uuid, '137321f4-421a-47d3-9186-9c39c45dc9ab'::uuid, '2026-05-10 14:00:00-03'::timestamptz, 2, 2, 2, 'El Chorrillo'),
        ('8ff76084-2fdb-4109-ba7a-3c2b0b93ffb2'::uuid, '8099c976-ddd4-448e-a165-c4f016d68c56'::uuid, '2026-05-09 15:30:00-03'::timestamptz, 2, 0, 0, 'Alianza - Candelaria'),
        ('4e709f54-4cc0-4058-be5c-a52710400ad8'::uuid, '926c9fb3-2b01-4dd4-bbcd-014abdb24ba6'::uuid, '2026-05-09 16:00:00-03'::timestamptz, 2, 3, 2, 'E.F.I. Juniors'),
        ('7eb88de9-cb19-4284-be3e-d2165dc72528'::uuid, '5198a500-423d-4110-8c9b-5c02ce0657c3'::uuid, '2026-05-10 16:00:00-03'::timestamptz, 2, 2, 1, 'San Francisco'),
        ('6e11f84a-c332-4b2b-a3b9-56ace65cad86'::uuid, '1173f19e-269e-4635-aa44-2d7c152d4ab2'::uuid, '2026-05-10 16:00:00-03'::timestamptz, 2, 2, 1, 'Atletico Concaran'),
        ('0c250862-2f63-4e40-bd1d-480a097a9362'::uuid, 'e20876b7-6fa3-4d58-b63e-2341501ffdc2'::uuid, '2026-05-10 15:30:00-03'::timestamptz, 2, 2, 1, 'Cryder Merlo'),
        ('349ed249-9a67-419e-aaca-6039d1964184'::uuid, '80d87c32-d07b-4ca0-b97a-12f2f491217a'::uuid, '2026-05-10 16:00:00-03'::timestamptz, 2, 1, 0, 'Colegiales V.M.'),
        ('13784493-7982-4706-a756-4e749967ea01'::uuid, 'c5f09151-df20-44f2-bdfe-25135584149c'::uuid, '2026-05-10 17:00:00-03'::timestamptz, 2, 1, 1, 'Belgrano J. Daract')
    ) as m(home_team_id, away_team_id, scheduled_at, leg, home_score, away_score, venue_name)
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
    where phase_id = phase_16avos
      and home_team_id = rec.home_team_id
      and away_team_id = rec.away_team_id
      and coalesce(leg, 1) = rec.leg
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
        phase_16avos,
        rec.home_team_id,
        rec.away_team_id,
        venue_match_id,
        rec.scheduled_at,
        'finished',
        rec.home_score,
        rec.away_score,
        rec.leg,
        'Historico Torneo Provincial 2026'
      );
    else
      update public.matches
      set scheduled_at = rec.scheduled_at,
          venue_id = venue_match_id,
          status = 'finished',
          home_score = rec.home_score,
          away_score = rec.away_score,
          leg = rec.leg,
          notes = coalesce(notes, 'Historico Torneo Provincial 2026'),
          updated_at = now()
      where id = existing_id;
    end if;
  end loop;
end $$;
