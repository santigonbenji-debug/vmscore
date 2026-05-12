-- VMScore: evitar notificaciones duplicadas por partido/dispositivo.

create table if not exists public.push_notification_deliveries (
  id uuid primary key default uuid_generate_v4(),
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  notification_type text not null,
  sent_at timestamptz default now(),
  unique (subscription_id, match_id, notification_type)
);

alter table public.push_notification_deliveries enable row level security;
