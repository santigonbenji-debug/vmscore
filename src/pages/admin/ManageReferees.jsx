import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useOrganizations } from '../../hooks/useOrganizations'
import { useReferees, useCreateReferee, useUpdateReferee, useDeleteReferee } from '../../hooks/useReferees'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'

const EMPTY_FORM = { organization_id: '', name: '', phone: '' }

export default function ManageReferees() {
  const { isSuperAdmin, organizationId, organization } = useAuth()
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const scopedOrgId = isSuperAdmin ? undefined : organizationId
  const { data: organizations = [] } = useOrganizations({ includeArchived: isSuperAdmin })
  const { data: referees = [], isLoading } = useReferees({ organizationId: scopedOrgId })
  const createReferee = useCreateReferee()
  const updateReferee = useUpdateReferee()
  const deleteReferee = useDeleteReferee()

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, organization_id: isSuperAdmin ? '' : organizationId })
    setModal(true)
  }

  function openEdit(referee) {
    setEditing(referee)
    setForm({
      organization_id: referee.organization_id ?? organizationId ?? '',
      name: referee.name,
      phone: referee.phone ?? '',
    })
    setModal(true)
  }

  async function save() {
    if (!form.organization_id || !form.name) return
    if (editing) await updateReferee.mutateAsync({ id: editing.id, ...form })
    else await createReferee.mutateAsync(form)
    setModal(false)
  }

  async function remove(referee) {
    if (!isSuperAdmin) return
    if (!window.confirm(`Eliminar a "${referee.name}"?`)) return
    await deleteReferee.mutateAsync(referee.id)
  }

  const saving = createReferee.isPending || updateReferee.isPending

  return (
    <div className="px-4 py-6 pb-28">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Arbitros</h1>
          <p className="mt-1 text-xs text-zinc-500">
            {isSuperAdmin ? 'Todas las organizaciones' : `${organization?.city ?? ''}, ${organization?.province ?? ''}`}
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>+ Nuevo Arbitro</Button>
      </div>

      {isLoading ? <Spinner className="py-12" /> : referees.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500">No hay arbitros cargados.</p>
      ) : (
        <div className="space-y-3">
          {referees.map((referee) => (
            <div key={referee.id} className="flex items-center justify-between rounded-xl border border-surface-800 bg-surface-900 p-4 shadow-sm">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-100">{referee.name}</p>
                {referee.phone && <p className="text-xs text-zinc-500">{referee.phone}</p>}
                {referee.organizations?.name && <p className="text-[10px] text-zinc-600">{referee.organizations.name}</p>}
              </div>
              <div className="flex shrink-0 gap-3">
                <button onClick={() => openEdit(referee)} className="text-xs font-medium text-primary">Editar</button>
                {isSuperAdmin && <button onClick={() => remove(referee)} className="text-xs font-medium text-red-400">Borrar</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar Arbitro' : 'Nuevo Arbitro'}>
        <div className="space-y-4">
          {isSuperAdmin ? (
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
              placeholder="Carlos Rodriguez"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2.5 text-sm text-zinc-100 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Telefono</label>
            <input
              type="text"
              value={form.phone}
              placeholder="2657-000000"
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2.5 text-sm text-zinc-100 focus:outline-none"
            />
          </div>

          <Button onClick={save} disabled={saving || !form.organization_id || !form.name} className="w-full">
            {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear Arbitro'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
