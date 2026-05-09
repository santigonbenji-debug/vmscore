import { useState } from 'react'
import { Link }     from 'react-router-dom'
import { useLeagues }   from '../../hooks/useLeagues'
import { usePhases }    from '../../hooks/useLeagues'
import { useMatches, useCreateMatch, useDeleteMatch, useUpdateMatchStatus } from '../../hooks/useMatches'
import { useTeams }     from '../../hooks/useTeams'
import { useVenues }    from '../../hooks/useVenues'
import { useReferees }  from '../../hooks/useReferees'
import { useSports }    from '../../hooks/useSports'
import Modal   from '../../components/ui/Modal'
import Button  from '../../components/ui/Button'
import Badge   from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import { formatFechaHora, labelStatus } from '../../lib/helpers'

const FORM_VACIO = {
  phase_id: '', home_team_id: '', away_team_id: '',
  venue_id: '', referee_id: '', scheduledAtLocal: '', round: '',
}

const STATUS_VARIANT = {
  scheduled: 'default', in_progress: 'live', finished: 'success',
  postponed: 'warning', cancelled: 'danger',
}

export default function ManageMatches() {
  const [ligaId, setLigaId]       = useState('')
  const [faseid, setFaseId]       = useState('')
  const [modal, setModal]         = useState(false)
  const [form, setForm]           = useState(FORM_VACIO)

  const { data: ligas = [] }   = useLeagues()
  const { data: fases = [] }   = usePhases(ligaId)
  const { data: partidos = [], isLoading } = useMatches({ phaseId: faseid || undefined })
  const { data: sports = [] }  = useSports()

  // Obtener sport_id de la liga seleccionada para filtrar equipos
  const ligaSeleccionada = ligas.find((l) => l.id === ligaId)
  const sportId = sports.find((s) => s.slug === ligaSeleccionada?.sports?.slug)?.id

  const { data: equipos = [] }   = useTeams({ sportId })
  const { data: canchas = [] }   = useVenues()
  const { data: arbitros = [] }  = useReferees()

  const crearPartido  = useCreateMatch()
  const borrarPartido = useDeleteMatch()
  const cambiarStatus = useUpdateMatchStatus()

  // Cuando cambia la liga, seleccionar la primera fase automáticamente
  function handleLigaChange(id) {
    setLigaId(id)
    setFaseId('')
  }

  function abrirCrear() {
    setForm({ ...FORM_VACIO, phase_id: faseid })
    setModal(true)
  }

  async function guardar() {
  if (!form.phase_id || !form.home_team_id || !form.away_team_id || !form.scheduledAtLocal) return
  if (form.home_team_id === form.away_team_id) {
    return alert('Local y visitante no pueden ser el mismo equipo.')
  }
  // Normalizar UUIDs opcionales y números opcionales: '' → null
  const payload = {
    phase_id:         form.phase_id,
    home_team_id:     form.home_team_id,
    away_team_id:     form.away_team_id,
    scheduledAtLocal: form.scheduledAtLocal,
    group_id:         form.group_id   || null,
    venue_id:         form.venue_id   || null,
    referee_id:       form.referee_id || null,
    round:            form.round ? parseInt(form.round) : null,
  }
  try {
    await crearPartido.mutateAsync(payload)
    setModal(false)
    setForm(FORM_VACIO)
  } catch (err) {
    if (err.code === 'DUPLICATE_MATCH' && err.existingMatchId) {
      const ir = window.confirm(
        'Ya existe un partido cargado entre estos dos equipos en este mismo horario.\n\n' +
        '¿Querés ir a editar el partido existente?'
      )
      if (ir) {
        setModal(false)
        window.location.href = `/admin/resultado/${err.existingMatchId}`
      }
      return
    }
    alert('Error al guardar el partido. Revisá los datos e intentá de nuevo.')
    console.error(err)
  }
}

  async function eliminar(p) {
    if (!window.confirm('¿Eliminar este partido?')) return
    await borrarPartido.mutateAsync(p.id)
  }

  const guardando = crearPartido.isPending

  const INPUT = "w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"

  return (
    <div className="px-4 py-6 pb-28">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-zinc-100">Partidos</h1>
        {faseid && <Button size="sm" onClick={abrirCrear}>+ Nuevo Partido</Button>}
      </div>

      {/* Selector de liga */}
      <div className="mb-3">
        <label className="text-xs font-semibold text-zinc-400 mb-1 block">Liga</label>
        <select value={ligaId} onChange={(e) => handleLigaChange(e.target.value)} className={INPUT}>
          <option value="">Seleccioná una liga...</option>
          {ligas.map((l) => <option key={l.id} value={l.id}>{l.sports?.icon} {l.name} · {l.season}</option>)}
        </select>
      </div>

      {/* Selector de fase */}
      {fases.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          {fases.map((f) => (
            <button key={f.id} onClick={() => setFaseId(f.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-colors
                ${faseid === f.id ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-300 hover:bg-surface-700'}`}>
              {f.name}
            </button>
          ))}
        </div>
      )}

      {!ligaId && (
        <p className="text-center text-zinc-500 py-16 text-sm">Seleccioná una liga para ver los partidos</p>
      )}
      {ligaId && fases.length === 0 && (
        <p className="text-center text-zinc-500 py-8 text-sm">Esta liga no tiene fases. Creá una desde Ligas.</p>
      )}
      {faseid && isLoading && <Spinner className="py-12" />}
      {faseid && !isLoading && partidos.length === 0 && (
        <p className="text-center text-zinc-500 py-12 text-sm">No hay partidos en esta fase todavía</p>
      )}

      {/* Lista de partidos */}
      {faseid && !isLoading && partidos.length > 0 && (
        <div className="space-y-3">
          {partidos.map((p) => (
            <div key={p.id} className="bg-surface-900 rounded-xl border border-surface-800 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-500">
                  Fecha {p.round ?? '—'} · {formatFechaHora(p.scheduled_at)}
                </span>
                <Badge variant={STATUS_VARIANT[p.status] ?? 'default'}>
                  {labelStatus(p.status)}
                </Badge>
              </div>

              <div className="flex items-center justify-center gap-3 py-1">
                <span className="font-semibold text-sm text-right flex-1 text-zinc-100">{p.home_team_short_name ?? p.home_team_name}</span>
                <span className="text-sm font-bold text-zinc-500">
                  {p.status === 'finished' ? `${p.home_score} - ${p.away_score}` : 'vs'}
                </span>
                <span className="font-semibold text-sm text-left flex-1 text-zinc-100">{p.away_team_short_name ?? p.away_team_name}</span>
              </div>

              <div className="flex gap-2 mt-3 flex-wrap">
                {p.status !== 'finished' && (
                  <Link to={`/admin/resultado/${p.id}`}>
                    <Button size="sm" variant="primary">Cargar resultado</Button>
                  </Link>
                )}
                {p.status === 'finished' && (
                  <Link to={`/admin/resultado/${p.id}`}>
                    <Button size="sm" variant="outline">Ver/editar resultado</Button>
                  </Link>
                )}
                {p.status === 'scheduled' && (
                  <Button size="sm" variant="secondary"
                    onClick={() => cambiarStatus.mutate({ id: p.id, status: 'postponed' })}>
                    Postergar
                  </Button>
                )}
                <button onClick={() => eliminar(p)} className="text-xs text-red-400 font-medium ml-auto hover:text-red-300">Borrar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal nuevo partido */}
      <Modal open={modal} onClose={() => setModal(false)} title="Nuevo Partido">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Fase *</label>
            <select value={form.phase_id} onChange={(e) => setForm({ ...form, phase_id: e.target.value })} className={INPUT}>
              <option value="">Seleccionar...</option>
              {fases.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          {(['home_team_id','away_team_id']).map((key) => (
            <div key={key}>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">
                {key === 'home_team_id' ? 'Equipo local *' : 'Equipo visitante *'}
              </label>
              <select value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={INPUT}>
                <option value="">Seleccionar...</option>
                {equipos.map((eq) => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
              </select>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">Fecha y hora (San Luis) *</label>
              <input type="datetime-local" value={form.scheduledAtLocal}
                onChange={(e) => setForm({ ...form, scheduledAtLocal: e.target.value })} className={INPUT} />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-400 mb-1 block">Fecha (jornada)</label>
              <input type="number" value={form.round} placeholder="1"
                onChange={(e) => setForm({ ...form, round: e.target.value })} className={INPUT} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Cancha (opcional)</label>
            <select value={form.venue_id} onChange={(e) => setForm({ ...form, venue_id: e.target.value })} className={INPUT}>
              <option value="">Sin asignar</option>
              {canchas.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Árbitro (opcional)</label>
            <select value={form.referee_id} onChange={(e) => setForm({ ...form, referee_id: e.target.value })} className={INPUT}>
              <option value="">Sin asignar</option>
              {arbitros.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <Button onClick={guardar}
            disabled={guardando || !form.phase_id || !form.home_team_id || !form.away_team_id || !form.scheduledAtLocal}
            className="w-full">
            {guardando ? 'Guardando...' : 'Crear Partido'}
          </Button>
          {crearPartido.isError && (
            <p className="text-red-400 text-xs text-center">Error al guardar. Verificá los datos.</p>
          )}
        </div>
      </Modal>
    </div>
  )
}
