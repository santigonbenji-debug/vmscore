-- VMScore: base para realtime y futuras notificaciones push.

alter table public.matches replica identity full;
alter table public.match_events replica identity full;
alter table public.standings replica identity full;
alter table public.manual_scorers replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.matches;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.match_events;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.standings;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.manual_scorers;
  exception when duplicate_object then null;
  end;
end $$;

create table if not exists public.push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  favorite_team_ids uuid[] not null default '{}',
  user_agent text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "usuarios registran su dispositivo" on public.push_subscriptions;
create policy "usuarios registran su dispositivo"
on public.push_subscriptions
for insert
to public
with check (true);

drop policy if exists "usuarios actualizan su dispositivo" on public.push_subscriptions;
create policy "usuarios actualizan su dispositivo"
on public.push_subscriptions
for update
to public
using (true)
with check (true);
