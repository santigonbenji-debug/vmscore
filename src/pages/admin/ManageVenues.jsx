import { useState } from 'react'
import { MapPin } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useOrganizations } from '../../hooks/useOrganizations'
import { useVenues, useCreateVenue, useUpdateVenue, useDeleteVenue } from '../../hooks/useVenues'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'

const EMPTY_FORM = { organization_id: '', name: '', address: '', city: '', capacity: '' }

export default function ManageVenues() {
  const { isSuperAdmin, organizationId, organization } = useAuth()
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const scopedOrgId = isSuperAdmin ? undefined : organizationId
  const { data: organizations = [] } = useOrganizations({ includeArchived: isSuperAdmin })
  const { data: venues = [], isLoading } = useVenues({ organizationId: scopedOrgId })
  const createVenue = useCreateVenue()
  const updateVenue = useUpdateVenue()
  const deleteVenue = useDeleteVenue()

  function selectedOrganization(id = form.organization_id) {
    return organizations.find((org) => org.id === id) ?? organization
  }

  function openCreate() {
    const org = isSuperAdmin ? null : organization
    setEditing(null)
    setForm({
      ...EMPTY_FORM,
      organization_id: isSuperAdmin ? '' : organizationId,
      city: org?.city ?? '',
    })
    setModal(true)
  }

  function openEdit(venue) {
    setEditing(venue)
    setForm({
      organization_id: venue.organization_id ?? organizationId ?? '',
      name: venue.name,
      address: venue.address ?? '',
      city: venue.city ?? venue.organizations?.city ?? organization?.city ?? '',
      capacity: venue.capacity ?? '',
    })
    setModal(true)
  }

  async function save() {
    if (!form.organization_id || !form.name) return
    const org = selectedOrganization()
    const payload = {
      ...form,
      city: form.city || org?.city || null,
      capacity: form.capacity ? parseInt(form.capacity) : null,
    }

    if (editing) await updateVenue.mutateAsync({ id: editing.id, ...payload })
    else await createVenue.mutateAsync(payload)
    setModal(false)
  }

  async function remove(venue) {
    if (!isSuperAdmin) return
    if (!window.confirm(`Eliminar "${venue.name}"?`)) return
    await deleteVenue.mutateAsync(venue.id)
  }

  const saving = createVenue.isPending || updateVenue.isPending

  return (
    <div className="px-4 py-6 pb-28">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Canchas</h1>
          <p className="mt-1 text-xs text-zinc-500">
            {isSuperAdmin ? 'Todas las organizaciones' : `${organization?.city ?? ''}, ${organization?.province ?? ''}`}
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>+ Nueva Cancha</Button>
      </div>

      {isLoading ? <Spinner className="py-12" /> : venues.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500">No hay canchas cargadas.</p>
      ) : (
        <div className="space-y-3">
          {venues.map((venue) => (
            <div key={venue.id} className="flex items-center justify-between rounded-xl border border-surface-800 bg-surface-900 p-4 shadow-sm">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-100">{venue.name}</p>
                <p className="text-xs text-zinc-500">{venue.address ? `${venue.address} - ` : ''}{venue.city}</p>
                {venue.organizations?.name && <p className="text-[10px] text-zinc-600">{venue.organizations.name}</p>}
                {venue.capacity && <p className="text-xs text-zinc-500">Capacidad: {venue.capacity}</p>}
              </div>
              <div className="flex shrink-0 gap-3">
                <button onClick={() => openEdit(venue)} className="text-xs font-medium text-primary">Editar</button>
                {isSuperAdmin && <button onClick={() => remove(venue)} className="text-xs font-medium text-red-400">Borrar</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editing ? 'Editar cancha' : 'Nueva cancha'}
        eyebrow="Sede"
        description="Carga una cancha para asignarla a partidos. La ciudad se toma de la organizacion si no la editas."
        icon={<MapPin className="h-5 w-5" />}
        guide={[
          { title: 'Organizacion', text: 'Limita quien puede usarla.' },
          { title: 'Ubicacion', text: 'Nombre, direccion y ciudad.' },
          { title: 'Partidos', text: 'Luego se elige desde fixture.' },
        ]}
      >
        <div className="space-y-4">
          {isSuperAdmin ? (
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Organizacion *</label>
              <select
                value={form.organization_id}
                onChange={(event) => {
                  const org = selectedOrganization(event.target.value)
                  setForm({ ...form, organization_id: event.target.value, city: org?.city ?? form.city })
                }}
                className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2.5 text-sm text-zinc-100 focus:outline-none"
              >
                <option value="">Seleccionar...</option>
                {organizations.filter((org) => org.status === 'active').map((org) => (
                  <option key={org.id} value={org.id}>{org.name} - {org.city}, {org.province}</option>
                ))}
              </select>
            </div>
          ) : organization ? (
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
              <p className="text-xs font-semibold text-primary">Organizacion</p>
              <p className="text-sm font-bold text-zinc-100">{organization.name}</p>
              <p className="text-xs text-zinc-400">{organization.city}, {organization.province}</p>
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Nombre *</label>
            <input
              type="text"
              value={form.name}
              placeholder="Polideportivo Municipal"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2.5 text-sm text-zinc-100 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Direccion</label>
            <input
              type="text"
              value={form.address}
              placeholder="Av. Principal 1200"
              onChange={(event) => setForm({ ...form, address: event.target.value })}
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2.5 text-sm text-zinc-100 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Ciudad</label>
              <input
                type="text"
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
                className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2.5 text-sm text-zinc-100 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Capacidad</label>
              <input
                type="number"
                value={form.capacity}
                placeholder="2000"
                onChange={(event) => setForm({ ...form, capacity: event.target.value })}
                className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2.5 text-sm text-zinc-100 focus:outline-none"
              />
            </div>
          </div>

          <Button onClick={save} disabled={saving || !form.organization_id || !form.name} className="w-full">
            {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear Cancha'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
