-- VMScore: no permitir clubes sin escudo en operaciones futuras.

alter table public.teams
  add constraint teams_logo_required
  check (logo_url is not null and nullif(trim(logo_url), '') is not null)
  not valid;

alter table public.teams validate constraint teams_logo_required;
