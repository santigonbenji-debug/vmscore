-- VMScore: entrega confiable y reintentable de alertas en vivo.

alter table public.live_sync_events
  add column if not exists push_notified_at timestamptz,
  add column if not exists push_attempted_at timestamptz,
  add column if not exists push_error text;

-- Los eventos anteriores ya fueron procesados con la version que no registraba
-- la respuesta del proveedor. No deben dispararse nuevamente al desplegar esto.
update public.live_sync_events
set push_notified_at = coalesce(push_notified_at, created_at),
    push_error = coalesce(push_error, 'Entrega historica sin confirmacion')
where push_notified_at is null;

create index if not exists live_sync_events_pending_push_idx
  on public.live_sync_events(match_id, created_at)
  where push_notified_at is null
    and event_type in ('start', 'goal', 'finish');
