begin;

alter table public.leagues
  drop constraint if exists leagues_competition_type_check;

alter table public.leagues
  add constraint leagues_competition_type_check
  check (competition_type in ('liga', 'copa', 'torneo', 'campeonato'));

-- Repair cups created while the interface still saved league defaults.
update public.leagues l
set format = 'playoffs'
where l.competition_type = 'copa'
  and l.format = 'round_robin'
  and not exists (
    select 1
    from public.phases p
    join public.matches m on m.phase_id = p.id
    where p.league_id = l.id
  );

update public.phases p
set name = 'Cuartos de final',
    type = 'knockout'
from public.leagues l
where l.id = p.league_id
  and l.competition_type = 'copa'
  and l.format = 'playoffs'
  and p.type = 'round_robin'
  and not exists (
    select 1 from public.matches m where m.phase_id = p.id
  );

commit;
