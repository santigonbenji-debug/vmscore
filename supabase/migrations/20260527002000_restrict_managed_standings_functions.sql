-- Managed standings operations are available only to authenticated admins.

revoke all on function public.ensure_managed_standings_rows(uuid) from public;
revoke all on function public.recalculate_managed_standings_phase(uuid) from public;

grant execute on function public.ensure_managed_standings_rows(uuid) to authenticated;
grant execute on function public.recalculate_managed_standings_phase(uuid) to authenticated;
