begin;

drop policy if exists "escritura superadmin sports" on public.sports;
drop policy if exists "escritura admin sports" on public.sports;

create policy "escritura admin sports"
on public.sports
for all
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

commit;
