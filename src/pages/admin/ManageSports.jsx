import { useState } from 'react'
import { Activity } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useOrganizations } from '../../hooks/useOrganizations'
import { useSports, useCreateSport, useUpdateSport, useDeleteSport } from '../../hooks/useSports'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'

const EMPTY_FORM = { organization_id: '', name: '', slug: '', icon: 'F' }
const ICONS = ['F', 'FS', 'B', 'V', 'T', 'H', 'R', 'P']

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function ManageSports() {
  const { isSuperAdmin, organizationId, organization } = useAuth()
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const scopedOrgId = isSuperAdmin ? undefined : organizationId
  const { data: organizations = [] } = useOrganizations({ includeArchived: isSuperAdmin })
  const { data: sports = [], isLoading } = useSports({ organizationId: scopedOrgId })
  const createSport = useCreateSport()
  const updateSport = useUpdateSport()
  const deleteSport = useDeleteSport()

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, organization_id: isSuperAdmin ? '' : organizationId })
    setModal(true)
  }

  function openEdit(sport) {
    setEditing(sport)
    setForm({
      organization_id: sport.organization_id ?? organizationId ?? '',
      name: sport.name,
      slug: sport.slug,
      icon: sport.icon ?? 'F',
    })
    setModal(true)
  }

  async function save() {
    if (!form.organization_id || !form.name || !form.slug) return
    const payload = {
      ...form,
      slug: slugify(form.slug),
    }
    if (editing) await updateSport.mutateAsync({ id: editing.id, ...payload })
    else await createSport.mutateAsync(payload)
    setModal(false)
  }

  async function remove(sport) {
    if (!isSuperAdmin) return
    if (!window.confirm(`Eliminar "${sport.name}"? Se borraran ligas y equipos asociados.`)) return
    await deleteSport.mutateAsync(sport.id)
  }

  const saving = createSport.isPending || updateSport.isPending

  return (
    <div className="px-4 py-6 pb-28">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Deportes</h1>
          <p className="mt-1 text-xs text-zinc-500">
            {isSuperAdmin ? 'Todos los deportes por organizacion' : `${organization?.city ?? ''}, ${organization?.province ?? ''}`}
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>+ Nuevo Deporte</Button>
      </div>

      {isLoading ? <Spinner className="py-12" /> : (
        <div className="space-y-3">
          {sports.map((sport) => (
            <div key={sport.id} className="flex items-center justify-between rounded-xl border border-surface-800 bg-surface-900 p-4 shadow-sm">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-sm font-black text-primary">{sport.icon}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-100">{sport.name}</p>
                  <p className="truncate font-mono text-xs text-zinc-500">{sport.slug}</p>
                  {sport.organizations?.name && <p className="truncate text-[10px] text-zinc-600">{sport.organizations.name}</p>}
                </div>
              </div>
              <div className="flex shrink-0 gap-3">
                <button onClick={() => openEdit(sport)} className="text-xs font-medium text-primary">Editar</button>
                {isSuperAdmin && <button onClick={() => remove(sport)} className="text-xs font-medium text-red-400">Borrar</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Editar deporte' : 'Nuevo deporte'}
        eyebrow="Deporte"
        description="Crea una disciplina dentro de la organizacion para separar equipos, competencias y planteles."
        icon={<Activity className="h-5 w-5" />}
        guide={[
          { title: 'Organizacion', text: 'Define donde vive.' },
          { title: 'Icono', text: 'Se ve en filtros y tablas.' },
          { title: 'Slug', text: 'Identificador interno limpio.' },
        ]}
      >
        <div className="space-y-4">
          {!isSuperAdmin && organization && (
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
              <p className="text-xs font-semibold text-primary">Organizacion</p>
              <p className="text-sm font-bold text-zinc-100">{organization.name}</p>
              <p className="text-xs text-zinc-400">{organization.city}, {organization.province}</p>
            </div>
          )}

          {isSuperAdmin && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Organizacion *</label>
              <select
                value={form.organization_id}
                onChange={(event) => setForm({ ...form, organization_id: event.target.value })}
                className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2.5 text-sm text-zinc-100 focus:outline-none"
              >
                <option value="">Seleccionar...</option>
                {organizations.filter((org) => org.status === 'active').map((org) => (
                  <option key={org.id} value={org.id}>{org.name} - {org.city}, {org.province}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Icono</label>
            <div className="mb-2 flex flex-wrap gap-2">
              {ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setForm({ ...form, icon })}
                  className={`rounded-lg px-2 py-1.5 text-sm font-black transition-colors ${
                    form.icon === icon ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-300'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={form.icon}
              maxLength={4}
              onChange={(event) => setForm({ ...form, icon: event.target.value })}
              className="w-20 rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-center text-sm font-black text-zinc-100 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Nombre *</label>
            <input
              type="text"
              value={form.name}
              placeholder="Futsal"
              onChange={(event) => {
                const name = event.target.value
                setForm({ ...form, name, slug: slugify(name) })
              }}
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2.5 text-sm text-zinc-100 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Slug</label>
            <input
              type="text"
              value={form.slug}
              onChange={(event) => setForm({ ...form, slug: slugify(event.target.value) })}
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2.5 font-mono text-sm text-zinc-100 focus:outline-none"
            />
          </div>

          <Button onClick={save} disabled={saving || !form.organization_id || !form.name || !form.slug} className="w-full">
            {saving ? 'Guardando...' : 'Guardar deporte'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
