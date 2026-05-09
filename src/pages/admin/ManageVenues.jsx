import { useState } from 'react'
import { useVenues, useCreateVenue, useUpdateVenue, useDeleteVenue } from '../../hooks/useVenues'
import Modal   from '../../components/ui/Modal'
import Button  from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'

const FORM_VACIO = { name: '', address: '', city: 'Villa Mercedes', capacity: '' }

export default function ManageVenues() {
  const [modal, setModal]       = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm]         = useState(FORM_VACIO)

  const { data: canchas = [], isLoading } = useVenues()
  const crear  = useCreateVenue()
  const editar = useUpdateVenue()
  const borrar = useDeleteVenue()

  function abrirCrear() { setEditando(null); setForm(FORM_VACIO); setModal(true) }
  function abrirEditar(c) {
    setEditando(c)
    setForm({ name: c.name, address: c.address ?? '', city: c.city ?? 'Villa Mercedes', capacity: c.capacity ?? '' })
    setModal(true)
  }
  async function guardar() {
    if (!form.name) return
    const data = { ...form, capacity: form.capacity ? parseInt(form.capacity) : null }
    if (editando) await editar.mutateAsync({ id: editando.id, ...data })
    else          await crear.mutateAsync(data)
    setModal(false)
  }
  async function eliminar(c) {
    if (!window.confirm(`¿Eliminar "${c.name}"?`)) return
    await borrar.mutateAsync(c.id)
  }

  const guardando = crear.isPending || editar.isPending

  return (
    <div className="px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-zinc-100">Canchas</h1>
        <Button size="sm" onClick={abrirCrear}>+ Nueva Cancha</Button>
      </div>

      {isLoading ? <Spinner className="py-12" /> : canchas.length === 0 ? (
        <p className="text-center text-zinc-500 py-16 text-sm">No hay canchas cargadas</p>
      ) : (
        <div className="space-y-3">
          {canchas.map((c) => (
            <div key={c.id} className="bg-surface-900 rounded-xl border border-surface-800 shadow-sm p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">🏟️ {c.name}</p>
                <p className="text-xs text-zinc-500">{c.address ? `${c.address} · ` : ''}{c.city}</p>
                {c.capacity && <p className="text-xs text-zinc-500">Capacidad: {c.capacity}</p>}
              </div>
              <div className="flex gap-3">
                <button onClick={() => abrirEditar(c)} className="text-xs text-primary font-medium">Editar</button>
                <button onClick={() => eliminar(c)} className="text-xs text-red-400 font-medium">Borrar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editando ? 'Editar Cancha' : 'Nueva Cancha'}>
        <div className="space-y-4">
          {[['name','Nombre *','Parque La Pedrera'],['address','Dirección','Av. España 1200'],
            ['city','Ciudad','Villa Mercedes']].map(([key, label, ph]) => (
            <div key={key}>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">{label}</label>
              <input type="text" value={form[key]} placeholder={ph}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none" />
            </div>
          ))}
          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Capacidad</label>
            <input type="number" value={form.capacity} placeholder="2000"
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none" />
          </div>
          <Button onClick={guardar} disabled={guardando || !form.name} className="w-full">
            {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear Cancha'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
