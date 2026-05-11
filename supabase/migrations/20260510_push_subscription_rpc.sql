-- VMScore: registrar suscripciones push sin exponer escrituras directas sensibles.

create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_favorite_team_ids uuid[] default '{}',
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(p_endpoint), '') is null
    or nullif(trim(p_p256dh), '') is null
    or nullif(trim(p_auth), '') is null then
    raise exception 'Datos de suscripcion incompletos';
  end if;

  insert into public.push_subscriptions (
    endpoint,
    p256dh,
    auth,
    favorite_team_ids,
    user_agent,
    updated_at
  )
  values (
    p_endpoint,
    p_p256dh,
    p_auth,
    coalesce(p_favorite_team_ids, '{}'),
    p_user_agent,
    now()
  )
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh,
        auth = excluded.auth,
        favorite_team_ids = excluded.favorite_team_ids,
        user_agent = excluded.user_agent,
        updated_at = now();
end;
$$;

revoke all on function public.register_push_subscription(text, text, text, uuid[], text) from public;
grant execute on function public.register_push_subscription(text, text, text, uuid[], text) to anon, authenticated;
