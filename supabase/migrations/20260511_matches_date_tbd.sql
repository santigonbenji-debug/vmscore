-- VMScore: permitir fixture importado sin dia/hora confirmados.

alter table public.matches
  alter column scheduled_at drop not null,
  add column if not exists date_tbd boolean not null default false;
