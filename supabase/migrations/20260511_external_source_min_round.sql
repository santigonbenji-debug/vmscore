-- VMScore: permitir iniciar importacion desde una fecha/jornada especifica.

alter table public.external_sources
  add column if not exists min_round integer default 1;
