-- Permite que un admin vea el motivo de archivo de su propia organizacion
-- aunque ya no pueda administrarla.

create or replace function public.can_read_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_superadmin()
    or exists (
      select 1
      from public.admin_roles ar
      where ar.user_id = auth.uid()
        and ar.organization_id = p_organization_id
        and coalesce(ar.status, 'active') = 'active'
    );
$$;

drop policy if exists "lectura publica organizations" on public.organizations;
create policy "lectura publica organizations"
on public.organizations
for select
using (
  status = 'active'
  or public.can_read_organization(id)
);

grant execute on function public.can_read_organization(uuid) to authenticated;
