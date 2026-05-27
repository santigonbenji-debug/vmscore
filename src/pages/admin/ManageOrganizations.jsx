import { useState } from 'react'
import { Building2, KeyRound } from 'lucide-react'
import {
  useArchiveOrganization,
  useCreateOrganization,
  useCreateOrganizationAdmin,
  useOrganizations,
  useSetOrganizationBlocked,
  useUnarchiveOrganization,
  useUpdateOrganization,
} from '../../hooks/useOrganizations'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'

const EMPTY_FORM = {
  name: '',
  slug: '',
  city: '',
  province: '',
  country: 'Argentina',
  logo_url: '',
  status: 'active',
}

const EMPTY_ACCESS = {
  organizationId: '',
  organizationName: '',
  email: '',
  password: '',
}

const STATUS_LABEL = {
  pending: 'Pendiente',
  active: 'Activa',
  archived: 'Archivada',
  blocked: 'Bloqueada',
}

const STATUS_VARIANT = {
  pending: 'warning',
  active: 'success',
  archived: 'default',
  blocked: 'danger',
}

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function generatePassword() {
  const bytes = new Uint32Array(4)
  window.crypto.getRandomValues(bytes)
  return `VM!${Array.from(bytes, (part) => part.toString(36)).join('-')}9a`
}

export default function ManageOrganizations() {
  const [modal, setModal] = useState(false)
  const [accessModal, setAccessModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [accessForm, setAccessForm] = useState(EMPTY_ACCESS)
  const [createdAccess, setCreatedAccess] = useState(null)

  const { data: organizations = [], isLoading } = useOrganizations({ includeArchived: true })
  const createOrganization = useCreateOrganization()
  const updateOrganization = useUpdateOrganization()
  const archiveOrganization = useArchiveOrganization()
  const unarchiveOrganization = useUnarchiveOrganization()
  const setBlocked = useSetOrganizationBlocked()
  const createAdmin = useCreateOrganizationAdmin()

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setModal(true)
  }

  function openEdit(org) {
    setEditing(org)
    setForm({
      name: org.name ?? '',
      slug: org.slug ?? '',
      city: org.city ?? '',
      province: org.province ?? '',
      country: org.country ?? 'Argentina',
      logo_url: org.logo_url ?? '',
      status: org.status ?? 'active',
    })
    setModal(true)
  }

  async function save() {
    if (!form.name || !form.city || !form.province) return
    const payload = {
      ...form,
      slug: form.slug ? slugify(form.slug) : slugify(`${form.city}-${form.name}`),
      logo_url: form.logo_url || null,
    }
    if (editing) await updateOrganization.mutateAsync({ id: editing.id, ...payload })
    else await createOrganization.mutateAsync(payload)
    setModal(false)
  }

  async function archive(org) {
    const reason = window.prompt(`Motivo para archivar "${org.name}"`, org.archive_reason ?? '')
    if (reason === null) return
    await archiveOrganization.mutateAsync({ id: org.id, reason })
  }

  async function unarchive(org) {
    if (!window.confirm(`Desarchivar "${org.name}" y volver a mostrar sus ligas aprobadas?`)) return
    await unarchiveOrganization.mutateAsync(org.id)
  }

  async function toggleBlocked(org) {
    const blocked = org.status !== 'blocked'
    const action = blocked ? 'bloquear acceso a' : 'desbloquear'
    if (!window.confirm(`Confirmas ${action} "${org.name}"?`)) return
    await setBlocked.mutateAsync({ id: org.id, blocked })
  }

  function openAccess(org) {
    createAdmin.reset()
    setCreatedAccess(null)
    setAccessForm({
      organizationId: org.id,
      organizationName: org.name,
      email: '',
      password: generatePassword(),
    })
    setAccessModal(true)
  }

  async function createAccess() {
    if (!accessForm.organizationId || !accessForm.email || accessForm.password.length < 12) return
    const result = await createAdmin.mutateAsync(accessForm)
    setCreatedAccess(result)
  }

  const saving = createOrganization.isPending || updateOrganization.isPending

  return (
    <div className="px-4 py-6 pb-28">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Organizaciones</h1>
          <p className="mt-1 text-xs text-zinc-500">Ubicacion, acceso, archivo y bloqueo por liga externa.</p>
        </div>
        <Button size="sm" onClick={openCreate}>+ Nueva</Button>
      </div>

      {isLoading ? <Spinner className="py-12" /> : (
        <div className="space-y-3">
          {organizations.map((org) => (
            <article key={org.id} className="rounded-xl border border-surface-800 bg-surface-900 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    {org.logo_url && <img src={org.logo_url} alt="" className="h-8 w-8 rounded-lg object-cover" />}
                    <p className="truncate text-sm font-bold text-zinc-100">{org.name}</p>
                  </div>
                  <p className="text-xs text-zinc-500">{org.city}, {org.province}</p>
                  <p className="mt-1 text-[10px] font-mono text-zinc-600">{org.slug}</p>
                  {org.archive_reason && (
                    <p className="mt-2 text-xs text-amber-300">Motivo: {org.archive_reason}</p>
                  )}
                </div>
                <Badge variant={STATUS_VARIANT[org.status]}>{STATUS_LABEL[org.status] ?? org.status}</Badge>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(org)}>Editar</Button>
                {org.status === 'archived' ? (
                  <Button size="sm" onClick={() => unarchive(org)}>Desarchivar</Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => archive(org)}>Archivar</Button>
                )}
                <Button size="sm" variant="outline" onClick={() => toggleBlocked(org)}>
                  {org.status === 'blocked' ? 'Desbloquear' : 'Bloquear acceso'}
                </Button>
                {org.status === 'active' && (
                  <Button size="sm" onClick={() => openAccess(org)}>Crear acceso</Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Editar organizacion' : 'Nueva organizacion'}
        eyebrow="Organizacion"
        description="Define la ubicacion y el alcance de trabajo. Esa ubicacion funciona como limite para sus competencias y equipos."
        icon={<Building2 className="h-5 w-5" />}
        size="lg"
        guide={[
          { title: 'Identidad', text: 'Nombre y logo de la entidad.' },
          { title: 'Ubicacion', text: 'Ciudad y provincia obligatorias.' },
          { title: 'Control', text: 'Luego podes archivar o bloquear.' },
        ]}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Nombre *</label>
            <input
              value={form.name}
              onChange={(event) => {
                const name = event.target.value
                setForm((current) => ({ ...current, name, slug: current.slug || slugify(`${current.city}-${name}`) }))
              }}
              className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
              placeholder="Liga Futsal San Juan"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Ciudad *</label>
              <input
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
                className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                placeholder="San Juan"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Provincia *</label>
              <input
                value={form.province}
                onChange={(event) => setForm({ ...form, province: event.target.value })}
                className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
                placeholder="San Juan"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Slug</label>
            <input
              value={form.slug}
              onChange={(event) => setForm({ ...form, slug: slugify(event.target.value) })}
              className="w-full rounded-lg px-3 py-2.5 font-mono text-sm focus:outline-none"
              placeholder="san-juan"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Logo URL</label>
            <input
              value={form.logo_url}
              onChange={(event) => setForm({ ...form, logo_url: event.target.value })}
              className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
              placeholder="https://..."
            />
          </div>

          <Button onClick={save} disabled={saving || !form.name || !form.city || !form.province} className="w-full">
            {saving ? 'Guardando...' : 'Guardar organizacion'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={accessModal}
        onClose={() => setAccessModal(false)}
        title="Crear acceso de organizacion"
        eyebrow="Acceso"
        description="Genera un usuario limitado a esta organizacion. No podra usar importaciones, scraping ni herramientas reservadas."
        icon={<KeyRound className="h-5 w-5" />}
        guide={[
          { title: 'Email', text: 'Usuario para ingresar.' },
          { title: 'Clave', text: 'Temporal y fuerte.' },
          { title: 'Permisos', text: 'Solo su organizacion.' },
        ]}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-surface-700 bg-surface-800/60 p-3">
            <p className="text-sm font-bold text-zinc-100">{accessForm.organizationName}</p>
            <p className="mt-1 text-xs text-zinc-400">
              Podra cargar datos solo dentro de esta organizacion. Importaciones y sincronizaciones quedan reservadas al superadmin.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Email de acceso *</label>
            <input
              type="email"
              value={accessForm.email}
              onChange={(event) => setAccessForm({ ...accessForm, email: event.target.value })}
              className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
              placeholder="admin@organizacion.com"
              disabled={!!createdAccess}
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <label className="block text-xs font-semibold text-zinc-400">Contraseña temporal *</label>
              {!createdAccess && (
                <button type="button" onClick={() => setAccessForm({ ...accessForm, password: generatePassword() })} className="text-xs font-semibold text-primary">
                  Generar otra
                </button>
              )}
            </div>
            <input
              type="text"
              value={accessForm.password}
              onChange={(event) => setAccessForm({ ...accessForm, password: event.target.value })}
              className="w-full rounded-lg px-3 py-2.5 font-mono text-sm focus:outline-none"
              disabled={!!createdAccess}
            />
            <p className="mt-1 text-[11px] text-zinc-500">Minimo 12 caracteres. Compartila una sola vez; luego puede usar Cambiar clave desde su panel.</p>
          </div>
          {createdAccess ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              Acceso creado para <strong>{createdAccess.email}</strong>. Ya puede ingresar al panel de su organizacion.
            </div>
          ) : (
            <Button onClick={createAccess} disabled={createAdmin.isPending || !accessForm.email || accessForm.password.length < 12} className="w-full">
              {createAdmin.isPending ? 'Creando acceso...' : 'Crear usuario y contraseña'}
            </Button>
          )}
          {createAdmin.isError && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
              {createAdmin.error?.message || 'No se pudo crear el acceso.'}
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
