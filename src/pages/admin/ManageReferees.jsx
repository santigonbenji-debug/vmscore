import { useState } from 'react'
import { useReferees, useCreateReferee, useUpdateReferee, useDeleteReferee } from '../../hooks/useReferees'
import Modal   from '../../components/ui/Modal'
import Button  from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'

const FORM_VACIO = { name: '', phone: '' }

export default function ManageReferees() {
  const [modal, setModal]       = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm]         = useState(FORM_VACIO)

  const { data: arbitros = [], isLoading } = useReferees()
  const crear  = useCreateReferee()
  const editar = useUpdateReferee()
  const borrar = useDeleteReferee()

  function abrirCrear() { setEditando(null); setForm(FORM_VACIO); setModal(true) }
  function abrirEditar(a) { setEditando(a); setForm({ name: a.name, phone: a.phone ?? '' }); setModal(true) }
  async function guardar() {
    if (!form.name) return
    if (editando) await editar.mutateAsync({ id: editando.id, ...form })
    else          await crear.mutateAsync(form)
    setModal(false)
  }
  async function eliminar(a) {
    if (!window.confirm(`¿Eliminar a "${a.name}"?`)) return
    await borrar.mutateAsync(a.id)
  }

  const guardando = crear.isPending || editar.isPending

  return (
    <div className="px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-zinc-100">Árbitros</h1>
        <Button size="sm" onClick={abrirCrear}>+ Nuevo Árbitro</Button>
      </div>

      {isLoading ? <Spinner className="py-12" /> : arbitros.length === 0 ? (
        <p className="text-center text-zinc-500 py-16 text-sm">No hay árbitros cargados</p>
      ) : (
        <div className="space-y-3">
          {arbitros.map((a) => (
            <div key={a.id} className="bg-surface-900 rounded-xl border border-surface-800 shadow-sm p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">🟨 {a.name}</p>
                {a.phone && <p className="text-xs text-zinc-500">{a.phone}</p>}
              </div>
              <div className="flex gap-3">
                <button onClick={() => abrirEditar(a)} className="text-xs text-primary font-medium">Editar</button>
                <button onClick={() => eliminar(a)} className="text-xs text-red-400 font-medium">Borrar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editando ? 'Editar Árbitro' : 'Nuevo Árbitro'}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Nombre *</label>
            <input type="text" value={form.name} placeholder="Carlos Rodríguez"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Teléfono</label>
            <input type="text" value={form.phone} placeholder="2657-000000"
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none" />
          </div>
          <Button onClick={guardar} disabled={guardando || !form.name} className="w-full">
            {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear Árbitro'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
