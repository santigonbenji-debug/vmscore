import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSports }        from '../../hooks/useSports'
import { useLeagues, useCreateLeague, useUpdateLeague, useDeleteLeague } from '../../hooks/useLeagues'
import Modal   from '../../components/ui/Modal'
import Button  from '../../components/ui/Button'
import Badge   from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import { useTeams } from '../../hooks/useTeams'

const STATUS_LABEL   = { upcoming: 'Próxima', active: 'Activa', finished: 'Finalizada' }
const STATUS_VARIANT = { upcoming: 'warning',  active: 'success', finished: 'default' }
const GENDER_LABEL   = { masculino: 'Masculino', femenino: 'Femenino', mixto: 'Mixto' }
const COMP_TYPES = [
  { value: 'liga',   label: 'Liga',   icon: '🏆', desc: 'Todos contra todos' },
  { value: 'copa',   label: 'Copa',   icon: '🥇', desc: 'Eliminación / Knockout' },
  { value: 'torneo', label: 'Torneo', icon: '🎯', desc: 'Formato libre / mixto' },
]

const FORM_VACIO = {
  sport_id: '', name: '', season: '', year: new Date().getFullYear(),
  gender: 'masculino', status: 'upcoming', champion_team_id: '',
  competition_type: 'liga',
}

const INPUT = "w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"

function EquipoSelector({ sportId, value, onChange }) {
  const { data: equipos = [] } = useTeams({ sportId })
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT}>
      <option value="">Sin campeón asignado</option>
      {equipos.map((e) => (
        <option key={e.id} value={e.id}>{e.name}</option>
      ))}
    </select>
  )
}

export default function ManageLeagues() {
  const navigate = useNavigate()
  const [modal, setModal]       = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm]         = useState(FORM_VACIO)
  const [filtro, setFiltro]     = useState('')

  const { data: sports = [] }                     = useSports()
  const { data: ligas = [], isLoading }           = useLeagues({ sportSlug: filtro || undefined })
  const crearLiga   = useCreateLeague()
  const editarLiga  = useUpdateLeague()
  const borrarLiga  = useDeleteLeague()

  function abrirCrear() {
    setEditando(null); setForm(FORM_VACIO); setModal(true)
  }
  function abrirEditar(l) {
    setEditando(l)
    setForm({
      sport_id: l.sport_id, name: l.name, season: l.season ?? '',
      year: l.year ?? new Date().getFullYear(), gender: l.gender, status: l.status,
      champion_team_id: l.champion_team_id ?? '',
      competition_type: l.competition_type ?? 'liga',
    })
    setModal(true)
  }
  async function guardar() {
    if (!form.sport_id || !form.name) return
    const payload = {
      ...form,
      champion_team_id: form.champion_team_id || null,
      season:           form.season || null,
    }
    if (editando) await editarLiga.mutateAsync({ id: editando.id, ...payload })
    else          await crearLiga.mutateAsync(payload)
    setModal(false)
  }
  async function borrar(l) {
    if (!window.confirm(`¿Eliminar "${l.name}"? Se borrarán todos sus datos.`)) return
    await borrarLiga.mutateAsync(l.id)
  }

  const guardando = crearLiga.isPending || editarLiga.isPending

  return (
    <div className="px-4 py-6 pb-28">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-zinc-100">Ligas</h1>
        <Button size="sm" onClick={abrirCrear}>+ Nueva Liga</Button>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
        {[{ slug: '', name: 'Todas', icon: '🏅' }, ...sports].map((s) => (
          <button key={s.slug} onClick={() => setFiltro(s.slug)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0
              ${filtro === s.slug ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-300 hover:bg-surface-700'}`}>
            {s.icon} {s.name}
          </button>
        ))}
      </div>

      {isLoading ? <Spinner className="py-12" /> : ligas.length === 0 ? (
        <p className="text-center text-zinc-500 py-16 text-sm">No hay ligas todavía</p>
      ) : (
        <div className="space-y-3">
          {ligas.map((l) => {
            const comp = COMP_TYPES.find((c) => c.value === (l.competition_type ?? 'liga'))
            return (
              <div key={l.id} className="bg-surface-900 rounded-xl border border-surface-800 shadow-sm p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span>{l.sports?.icon}</span>
                      <span className="font-semibold text-sm truncate text-zinc-100">{l.name}</span>
                    </div>
                    <p className="text-xs text-zinc-500 mb-2">{l.season} {l.year && `· ${l.year}`}</p>
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant={STATUS_VARIANT[l.status]}>{STATUS_LABEL[l.status]}</Badge>
                      <Badge>{GENDER_LABEL[l.gender]}</Badge>
                      {comp && <Badge variant="primary">{comp.icon} {comp.label}</Badge>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 ml-2 shrink-0 items-end">
                    <button onClick={() => navigate(`/admin/posiciones?liga=${l.id}`)}
                      className="text-xs text-emerald-400 font-medium hover:text-emerald-300">
                      📊 Tabla
                    </button>
                    <button onClick={() => navigate(`/admin/goleadores?liga=${l.id}`)}
                      className="text-xs text-amber-400 font-medium hover:text-amber-300">
                      ⚽ Goleadores
                    </button>
                    <button onClick={() => abrirEditar(l)}
                      className="text-xs text-primary font-medium hover:text-primary-400">
                      Editar
                    </button>
                    <button onClick={() => borrar(l)}
                      className="text-xs text-red-400 font-medium hover:text-red-300">
                      Borrar
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editando ? 'Editar Liga' : 'Nueva Liga'}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Deporte *</label>
            <select value={form.sport_id} onChange={(e) => setForm({ ...form, sport_id: e.target.value })} className={INPUT}>
              <option value="">Seleccionar...</option>
              {sports.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Nombre *</label>
            <input type="text" value={form.name} placeholder="Liga Mercedina de Fútbol"
              onChange={(e) => setForm({ ...form, name: e.target.value })} className={INPUT} />
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1.5 block">Tipo de competencia *</label>
            <div className="grid grid-cols-3 gap-2">
              {COMP_TYPES.map((c) => (
                <button key={c.value} type="button"
                  onClick={() => setForm({ ...form, competition_type: c.value })}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors text-center
                    ${form.competition_type === c.value
                      ? 'bg-primary/15 border-primary text-primary'
                      : 'bg-surface-800 border-surface-700 text-zinc-300 hover:border-surface-600'}`}>
                  <span className="text-lg">{c.icon}</span>
                  <span className="text-xs font-bold">{c.label}</span>
                  <span className="text-[9px] opacity-70 leading-tight">{c.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">Temporada</label>
              <input type="text" value={form.season} placeholder="Apertura 2025"
                onChange={(e) => setForm({ ...form, season: e.target.value })} className={INPUT} />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">Año</label>
              <input type="number" value={form.year}
                onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) })} className={INPUT} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">División</label>
              <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className={INPUT}>
                <option value="masculino">Masculino</option>
                <option value="femenino">Femenino</option>
                <option value="mixto">Mixto</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">Estado</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={INPUT}>
                <option value="upcoming">Próxima</option>
                <option value="active">Activa</option>
                <option value="finished">Finalizada</option>
              </select>
            </div>
          </div>

          {form.status === 'finished' && (
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">
                🏆 Equipo Campeón
              </label>
              <EquipoSelector
                sportId={sports.find((s) => s.id === form.sport_id)?.id}
                value={form.champion_team_id ?? ''}
                onChange={(val) => setForm({ ...form, champion_team_id: val })}
              />
            </div>
          )}

          {editando && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button"
                onClick={() => { setModal(false); navigate(`/admin/posiciones?liga=${editando.id}`) }}
                className="text-xs font-semibold text-emerald-400 border border-emerald-500/40 rounded-lg py-2 hover:bg-emerald-500/10 transition-colors">
                📊 Tabla
              </button>
              <button type="button"
                onClick={() => { setModal(false); navigate(`/admin/goleadores?liga=${editando.id}`) }}
                className="text-xs font-semibold text-amber-400 border border-amber-500/40 rounded-lg py-2 hover:bg-amber-500/10 transition-colors">
                ⚽ Goleadores
              </button>
            </div>
          )}

          <Button onClick={guardar} disabled={guardando || !form.sport_id || !form.name} className="w-full">
            {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear Liga'}
          </Button>
          {(crearLiga.isError || editarLiga.isError) && (
            <p className="text-red-400 text-xs text-center">Error al guardar. Intentá de nuevo.</p>
          )}
        </div>
      </Modal>
    </div>
  )
}
