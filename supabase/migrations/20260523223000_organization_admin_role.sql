alter table public.admin_roles
  drop constraint if exists admin_roles_role_check;

alter table public.admin_roles
  add constraint admin_roles_role_check
  check (role in ('superadmin', 'organization_admin', 'liga_admin', 'club_admin'));
