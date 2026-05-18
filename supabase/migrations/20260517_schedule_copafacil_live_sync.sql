-- Revisa Copa Facil cada minuto para detectar inicio, goles y final sin computar tabla automaticamente.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

do $$
begin
  perform cron.unschedule('sync-copafacil-live-every-minute');
exception
  when others then null;
end $$;

select cron.schedule(
  'sync-copafacil-live-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://oycaqyzkrkclorznpnhn.supabase.co/functions/v1/sync-copafacil-live',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"limit":120}'::jsonb
  );
  $$
);
