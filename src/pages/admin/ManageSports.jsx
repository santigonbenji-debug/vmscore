import { useState } from 'react'
import { useSports, useCreateSport, useUpdateSport, useDeleteSport } from '../../hooks/useSports'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'

const FORM_VACIO = { name: '', slug: '', icon: '🏅' }
const ICONOS_SUGERIDOS = ['⚽', '🏀', '🏐', '🎾', '🏈', '⚾', '🏉', '🏒', '🎱', '🏓', '🥊', '🏊', '🚴', '🤼']

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function ManageSports() {
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(FORM_VACIO)

  const { data: deportes = [], isLoading } = useSports()
  const crear = useCreateSport()
  const editar = useUpdateSport()
  const borrar = useDeleteSport()

  function abrirCrear() {
    setEditando(null)
    setForm(FORM_VACIO)
    setModal(true)
  }

  function abrirEditar(deporte) {
    setEditando(deporte)
    setForm({
      name: deporte.name,
      slug: deporte.slug,
      icon: deporte.icon ?? '🏅',
    })
    setModal(true)
  }

  async function guardar() {
    if (!form.name || !form.slug) return
    const payload = { ...form, slug: slugify(form.slug) }
    if (editando) await editar.mutateAsync({ id: editando.id, ...payload })
    else await crear.mutateAsync(payload)
    setModal(false)
  }

  async function eliminar(deporte) {
    if (!window.confirm(`Eliminar "${deporte.name}"? Se borraran todas sus ligas y equipos.`)) return
    await borrar.mutateAsync(deporte.id)
  }

  const guardando = crear.isPending || editar.isPending

  return (
    <div className="px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-zinc-100">Deportes</h1>
        <Button size="sm" onClick={abrirCrear}>+ Nuevo Deporte</Button>
      </div>

      {isLoading ? <Spinner className="py-12" /> : (
        <div className="space-y-3">
          {deportes.map((deporte) => (
            <div key={deporte.id} className="bg-surface-900 rounded-xl border border-surface-800 shadow-sm p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-3xl shrink-0">{deporte.icon}</span>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{deporte.name}</p>
                  <p className="text-xs text-zinc-500 font-mono truncate">{deporte.slug}</p>
                </div>
              </div>
              <div className="flex gap-3 shrink-0">
                <button onClick={() => abrirEditar(deporte)} className="text-xs text-primary font-medium">Editar</button>
                <button onClick={() => eliminar(deporte)} className="text-xs text-red-400 font-medium">Borrar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editando ? 'Editar Deporte' : 'Nuevo Deporte'}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Icono</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {ICONOS_SUGERIDOS.map((icono) => (
                <button key={icono} onClick={() => setForm({ ...form, icon: icono })}
                  className={`text-2xl p-1.5 rounded-lg transition-colors
                    ${form.icon === icono ? 'bg-primary/10 ring-2 ring-primary' : 'hover:bg-surface-800'}`}>
                  {icono}
                </button>
              ))}
            </div>
            <input type="text" value={form.icon} maxLength={4}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              className="w-20 border border-surface-700 rounded-lg px-3 py-2 text-center text-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Nombre *</label>
            <input type="text" value={form.name} placeholder="Futbol Sala"
              onChange={(e) => {
                const name = e.target.value
                setForm({ ...form, name, slug: slugify(name) })
              }}
              className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none" />
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Slug</label>
            <input type="text" value={form.slug}
              onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })}
              className="w-full border border-surface-700 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <Button onClick={guardar} disabled={guardando || !form.name} className="w-full">
            {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear Deporte'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
