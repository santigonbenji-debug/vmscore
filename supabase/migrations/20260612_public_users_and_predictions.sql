create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  favorite_team_id uuid references public.teams(id) on delete set null,
  avatar_style jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.match_predictions (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  prediction text not null check (prediction in ('home', 'draw', 'away')),
  source text not null default 'social' check (source in ('social', 'prode')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, user_id, source)
);

create index if not exists match_predictions_match_idx
  on public.match_predictions(match_id, source);

create index if not exists user_profiles_favorite_team_idx
  on public.user_profiles(favorite_team_id);

alter table public.user_profiles enable row level security;
alter table public.match_predictions enable row level security;

drop policy if exists "user profiles own select" on public.user_profiles;
create policy "user profiles own select"
on public.user_profiles for select
using (auth.uid() = user_id);

drop policy if exists "user profiles own insert" on public.user_profiles;
create policy "user profiles own insert"
on public.user_profiles for insert
with check (auth.uid() = user_id);

drop policy if exists "user profiles own update" on public.user_profiles;
create policy "user profiles own update"
on public.user_profiles for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "match predictions own select" on public.match_predictions;
create policy "match predictions own select"
on public.match_predictions for select
using (auth.uid() = user_id);

drop policy if exists "match predictions own insert" on public.match_predictions;
create policy "match predictions own insert"
on public.match_predictions for insert
with check (
  auth.uid() = user_id
  and source = 'social'
  and exists (
    select 1
    from public.matches m
    where m.id = match_id
      and m.status = 'scheduled'
      and m.scheduled_at > now()
  )
);

drop policy if exists "match predictions own update" on public.match_predictions;
create policy "match predictions own update"
on public.match_predictions for update
using (auth.uid() = user_id and source = 'social')
with check (
  auth.uid() = user_id
  and source = 'social'
  and exists (
    select 1
    from public.matches m
    where m.id = match_id
      and m.status = 'scheduled'
      and m.scheduled_at > now()
  )
);

create or replace function public.get_match_prediction_summary(p_match_id uuid)
returns table(prediction text, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select mp.prediction, count(*)::bigint as total
  from public.match_predictions mp
  where mp.match_id = p_match_id
    and mp.source = 'social'
  group by mp.prediction
$$;

grant execute on function public.get_match_prediction_summary(uuid) to anon, authenticated;
