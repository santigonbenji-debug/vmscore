-- VMScore: validar historicos externos sin afectar fixture oficial.

alter table public.external_match_archive
  add column if not exists review_status text not null default 'pending',
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid,
  add column if not exists admin_notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'external_match_archive_review_status_check'
  ) then
    alter table public.external_match_archive
      add constraint external_match_archive_review_status_check
      check (review_status in ('pending', 'confirmed', 'ignored'));
  end if;
end $$;

update public.external_match_archive
set review_status = case
    when scheduled_at is not null
      and home_score is not null
      and away_score is not null
      then 'confirmed'
    else 'pending'
  end,
  confirmed_at = case
    when scheduled_at is not null
      and home_score is not null
      and away_score is not null
      then coalesce(confirmed_at, updated_at, now())
    else confirmed_at
  end
where review_status = 'pending';
