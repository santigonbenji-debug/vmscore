-- Ejecuta el chequeo en vivo de Locos VM desde Supabase cada 5 minutos.
-- Vercel Hobby solo permite crons diarios; esta tarea queda cerca de la base.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

do $$
begin
  perform cron.unschedule('sync-locos-live-every-5-minutes');
exception
  when others then null;
end $$;

select cron.schedule(
  'sync-locos-live-every-5-minutes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://oycaqyzkrkclorznpnhn.supabase.co/functions/v1/sync-locos-live',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"limit":30}'::jsonb
  );
  $$
);
