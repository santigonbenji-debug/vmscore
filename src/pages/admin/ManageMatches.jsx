import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeagues, usePhases } from '../../hooks/useLeagues'
import {
  useCreateMatch,
  useDeleteMatch,
  useMatches,
  useUpdateMatchDetails,
  useUpdateMatchStatus,
} from '../../hooks/useMatches'
import { useTeams } from '../../hooks/useTeams'
import { useVenues } from '../../hooks/useVenues'
import { useReferees } from '../../hooks/useReferees'
import { useSports } from '../../hooks/useSports'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import { formatFechaHora, labelStatus, utcToInputLocal } from '../../lib/helpers'

const INPUT = 'w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30'

const FORM_VACIO = {
  phase_id: '',
  home_team_id: '',
  away_team_id: '',
  venue_id: '',
  referee_id: '',
  scheduledAtLocal: '',
  round: '',
}

const EDIT_FORM_VACIO = {
  scheduledAtLocal: '',
  round: '',
  venue_id: '',
  referee_id: '',
  status: 'scheduled',
  notes: '',
}

const STATUS_VARIANT = {
  scheduled: 'default',
  in_progress: 'live',
  finished: 'success',
  postponed: 'warning',
  cancelled: 'danger',
}

export default function ManageMatches() {
  const [ligaId, setLigaId] = useState('')
  const [faseid, setFaseId] = useState('')
  const [fechaFiltro, setFechaFiltro] = useState('all')
  const [modal, setModal] = useState(false)
  const [modalEditar, setModalEditar] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [editando, setEditando] = useState(null)
  const [editForm, setEditForm] = useState(EDIT_FORM_VACIO)

  const { data: ligas = [] } = useLeagues()
  const { data: fases = [] } = usePhases(ligaId)
  const { data: partidos = [], isLoading } = useMatches({ phaseId: faseid || undefined })
  const { data: sports = [] } = useSports()

  const ligaSeleccionada = ligas.find((liga) => liga.id === ligaId)
  const sportId = sports.find((sport) => sport.slug === ligaSeleccionada?.sports?.slug)?.id

  const { data: equipos = [] } = useTeams({ sportId })
  const { data: canchas = [] } = useVenues()
  const { data: arbitros = [] } = useReferees()

  const crearPartido = useCreateMatch()
  const borrarPartido = useDeleteMatch()
  const cambiarStatus = useUpdateMatchStatus()
  const actualizarDetalles = useUpdateMatchDetails()

  const fechasDisponibles = useMemo(() => {
    const values = [...new Set(partidos.map((partido) => partido.round).filter((round) => round !== null && round !== undefined))]
    return values.sort((a, b) => Number(a) - Number(b))
  }, [partidos])

  const partidosFiltrados = useMemo(() => {
    if (fechaFiltro === 'all') return partidos
    if (fechaFiltro === 'none') return partidos.filter((partido) => partido.round === null || partido.round === undefined)
    return partidos.filter((partido) => String(partido.round) === fechaFiltro)
  }, [fechaFiltro, partidos])

  const partidosPorFecha = useMemo(() => {
    const grupos = {}
    partidosFiltrados.forEach((partido) => {
      const key = partido.round ?? 'none'
      if (!grupos[key]) {
        grupos[key] = {
          key,
          label: partido.round ? `Fecha ${partido.round}` : 'Sin fecha asignada',
          partidos: [],
        }
      }
      grupos[key].partidos.push(partido)
    })

    return Object.values(grupos).sort((a, b) => {
      if (a.key === 'none') return 1
      if (b.key === 'none') return -1
      return Number(a.key) - Number(b.key)
    })
  }, [partidosFiltrados])

  function handleLigaChange(id) {
    setLigaId(id)
    setFaseId('')
    setFechaFiltro('all')
  }

  function handleFaseChange(id) {
    setFaseId(id)
    setFechaFiltro('all')
  }

  function abrirCrear() {
    setForm({ ...FORM_VACIO, phase_id: faseid })
    setModal(true)
  }

  function abrirEditar(partido) {
    setEditando(partido)
    setEditForm({
      scheduledAtLocal: utcToInputLocal(partido.scheduled_at),
      round: partido.round ?? '',
      venue_id: partido.venue_id ?? '',
      referee_id: partido.referee_id ?? '',
      status: partido.status ?? 'scheduled',
      notes: partido.notes ?? '',
    })
    setModalEditar(true)
  }

  async function guardar() {
    if (!form.phase_id || !form.home_team_id || !form.away_team_id || !form.scheduledAtLocal) return
    if (form.home_team_id === form.away_team_id) {
      return alert('Local y visitante no pueden ser el mismo equipo.')
    }

    const payload = {
      phase_id: form.phase_id,
      home_team_id: form.home_team_id,
      away_team_id: form.away_team_id,
      scheduledAtLocal: form.scheduledAtLocal,
      group_id: form.group_id || null,
      venue_id: form.venue_id || null,
      referee_id: form.referee_id || null,
      round: form.round ? parseInt(form.round) : null,
    }

    try {
      await crearPartido.mutateAsync(payload)
      setModal(false)
      setForm(FORM_VACIO)
    } catch (err) {
      if (err.code === 'DUPLICATE_MATCH' && err.existingMatchId) {
        const ir = window.confirm('Ya existe un partido cargado entre estos dos equipos en este mismo horario.\n\nQueres ir a editar el partido existente?')
        if (ir) {
          setModal(false)
          window.location.href = `/admin/resultado/${err.existingMatchId}`
        }
        return
      }
      alert('Error al guardar el partido. Revisa los datos e intenta de nuevo.')
      console.error(err)
    }
  }

  async function guardarEdicion() {
    if (!editando) return
    await actualizarDetalles.mutateAsync({
      id: editando.id,
      scheduledAtLocal: editForm.scheduledAtLocal,
      round: editForm.round === '' ? null : parseInt(editForm.round),
      venue_id: editForm.venue_id || null,
      referee_id: editForm.referee_id || null,
      status: editForm.status,
      notes: editForm.notes || null,
    })
    setModalEditar(false)
    setEditando(null)
    setEditForm(EDIT_FORM_VACIO)
  }

  async function eliminar(partido) {
    if (!window.confirm('Eliminar este partido?')) return
    await borrarPartido.mutateAsync(partido.id)
  }

  const guardando = crearPartido.isPending

  return (
    <div className="px-4 py-6 pb-28">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Partidos</h1>
          <p className="mt-1 text-xs text-zinc-500">Edita fixture, cancha y resultados por division y fecha.</p>
        </div>
        {faseid && <Button size="sm" onClick={abrirCrear}>+ Nuevo Partido</Button>}
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-xs font-semibold text-zinc-400">Division</label>
        <select value={ligaId} onChange={(event) => handleLigaChange(event.target.value)} className={INPUT}>
          <option value="">Selecciona una division...</option>
          {ligas.map((liga) => (
            <option key={liga.id} value={liga.id}>
              {liga.sports?.icon} {liga.name} · {liga.season}
            </option>
          ))}
        </select>
      </div>

      {fases.length > 0 && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
          {fases.map((fase) => (
            <button
              key={fase.id}
              onClick={() => handleFaseChange(fase.id)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                faseid === fase.id ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-300 hover:bg-surface-700'
              }`}
            >
              {fase.name}
            </button>
          ))}
        </div>
      )}

      {!ligaId && (
        <p className="py-16 text-center text-sm text-zinc-500">Selecciona una division para ver los partidos</p>
      )}
      {ligaId && fases.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">Esta division no tiene fases. Creala desde Ligas.</p>
      )}
      {faseid && isLoading && <Spinner className="py-12" />}
      {faseid && !isLoading && partidos.length === 0 && (
        <p className="py-12 text-center text-sm text-zinc-500">No hay partidos en esta fase todavia</p>
      )}

      {faseid && partidos.length > 0 && (
        <div className="mb-4 rounded-xl border border-surface-800 bg-surface-900 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">Fecha</p>
            <p className="text-xs text-zinc-500">{partidosFiltrados.length} partido{partidosFiltrados.length === 1 ? '' : 's'}</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setFechaFiltro('all')}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${fechaFiltro === 'all' ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-300'}`}
            >
              Todas
            </button>
            {fechasDisponibles.map((round) => (
              <button
                key={round}
                type="button"
                onClick={() => setFechaFiltro(String(round))}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${fechaFiltro === String(round) ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-300'}`}
              >
                Fecha {round}
              </button>
            ))}
            {partidos.some((partido) => partido.round === null || partido.round === undefined) && (
              <button
                type="button"
                onClick={() => setFechaFiltro('none')}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${fechaFiltro === 'none' ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-300'}`}
              >
                Sin fecha
              </button>
            )}
          </div>
        </div>
      )}

      {faseid && !isLoading && partidosFiltrados.length > 0 && (
        <div className="space-y-4">
          {partidosPorFecha.map((grupo) => (
            <section key={grupo.key} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-black text-zinc-100">{grupo.label}</h2>
                <span className="text-xs text-zinc-500">{grupo.partidos.length} partido{grupo.partidos.length === 1 ? '' : 's'}</span>
              </div>

              {grupo.partidos.map((partido) => (
                <div key={partido.id} className="rounded-xl border border-surface-800 bg-surface-900 p-4 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs text-zinc-500">{formatFechaHora(partido.scheduled_at)}</span>
                    <Badge variant={STATUS_VARIANT[partido.status] ?? 'default'}>
                      {labelStatus(partido.status)}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-center gap-3 py-1">
                    <span className="flex-1 text-right text-sm font-semibold text-zinc-100">{partido.home_team_short_name ?? partido.home_team_name}</span>
                    <span className="text-sm font-bold text-zinc-500">
                      {partido.status === 'finished' ? `${partido.home_score} - ${partido.away_score}` : 'vs'}
                    </span>
                    <span className="flex-1 text-left text-sm font-semibold text-zinc-100">{partido.away_team_short_name ?? partido.away_team_name}</span>
                  </div>

                  <div className="mt-2 grid gap-1 text-xs text-zinc-500 sm:grid-cols-2">
                    <p className="truncate">Cancha: <span className="text-zinc-300">{partido.venue_name ?? 'Sin asignar'}</span></p>
                    <p className="truncate">Arbitro: <span className="text-zinc-300">{partido.referee_name ?? 'Sin asignar'}</span></p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {partido.status !== 'finished' && (
                      <Link to={`/admin/resultado/${partido.id}`}>
                        <Button size="sm" variant="primary">Cargar resultado</Button>
                      </Link>
                    )}
                    {partido.status === 'finished' && (
                      <Link to={`/admin/resultado/${partido.id}`}>
                        <Button size="sm" variant="outline">Ver/editar resultado</Button>
                      </Link>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => abrirEditar(partido)}>
                      Editar detalles
                    </Button>
                    {partido.status === 'scheduled' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => cambiarStatus.mutate({ id: partido.id, status: 'postponed' })}
                      >
                        Postergar
                      </Button>
                    )}
                    <button onClick={() => eliminar(partido)} className="ml-auto text-xs font-medium text-red-400 hover:text-red-300">
                      Borrar
                    </button>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Nuevo Partido">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Fase *</label>
            <select value={form.phase_id} onChange={(event) => setForm({ ...form, phase_id: event.target.value })} className={INPUT}>
              <option value="">Seleccionar...</option>
              {fases.map((fase) => <option key={fase.id} value={fase.id}>{fase.name}</option>)}
            </select>
          </div>

          {(['home_team_id', 'away_team_id']).map((key) => (
            <div key={key}>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">
                {key === 'home_team_id' ? 'Equipo local *' : 'Equipo visitante *'}
              </label>
              <select value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className={INPUT}>
                <option value="">Seleccionar...</option>
                {equipos.map((equipo) => <option key={equipo.id} value={equipo.id}>{equipo.name}</option>)}
              </select>
            </div>
          ))}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Fecha y hora *</label>
              <input
                type="datetime-local"
                value={form.scheduledAtLocal}
                onChange={(event) => setForm({ ...form, scheduledAtLocal: event.target.value })}
                className={INPUT}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Fecha</label>
              <input
                type="number"
                value={form.round}
                placeholder="9"
                onChange={(event) => setForm({ ...form, round: event.target.value })}
                className={INPUT}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Cancha</label>
            <select value={form.venue_id} onChange={(event) => setForm({ ...form, venue_id: event.target.value })} className={INPUT}>
              <option value="">Sin asignar</option>
              {canchas.map((cancha) => <option key={cancha.id} value={cancha.id}>{cancha.name}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Arbitro</label>
            <select value={form.referee_id} onChange={(event) => setForm({ ...form, referee_id: event.target.value })} className={INPUT}>
              <option value="">Sin asignar</option>
              {arbitros.map((arbitro) => <option key={arbitro.id} value={arbitro.id}>{arbitro.name}</option>)}
            </select>
          </div>

          <Button
            onClick={guardar}
            disabled={guardando || !form.phase_id || !form.home_team_id || !form.away_team_id || !form.scheduledAtLocal}
            className="w-full"
          >
            {guardando ? 'Guardando...' : 'Crear Partido'}
          </Button>
          {crearPartido.isError && (
            <p className="text-center text-xs text-red-400">Error al guardar. Verifica los datos.</p>
          )}
        </div>
      </Modal>

      <Modal open={modalEditar} onClose={() => setModalEditar(false)} title="Editar partido">
        <div className="space-y-4">
          {editando && (
            <div className="rounded-lg border border-surface-800 bg-surface-900 p-3 text-sm font-bold text-zinc-100">
              {(editando.home_team_short_name ?? editando.home_team_name)} vs {(editando.away_team_short_name ?? editando.away_team_name)}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Fecha y hora</label>
              <input
                type="datetime-local"
                value={editForm.scheduledAtLocal}
                onChange={(event) => setEditForm({ ...editForm, scheduledAtLocal: event.target.value })}
                className={INPUT}
              />
              <p className="mt-1 text-[10px] text-zinc-500">Vacio: a definir.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Fecha</label>
              <input
                type="number"
                value={editForm.round}
                placeholder="9"
                onChange={(event) => setEditForm({ ...editForm, round: event.target.value })}
                className={INPUT}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Cancha</label>
            <select value={editForm.venue_id} onChange={(event) => setEditForm({ ...editForm, venue_id: event.target.value })} className={INPUT}>
              <option value="">Sin asignar</option>
              {canchas.map((cancha) => <option key={cancha.id} value={cancha.id}>{cancha.name}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Arbitro</label>
            <select value={editForm.referee_id} onChange={(event) => setEditForm({ ...editForm, referee_id: event.target.value })} className={INPUT}>
              <option value="">Sin asignar</option>
              {arbitros.map((arbitro) => <option key={arbitro.id} value={arbitro.id}>{arbitro.name}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Estado</label>
            <select value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })} className={INPUT}>
              <option value="scheduled">Programado</option>
              <option value="in_progress">En vivo</option>
              <option value="finished">Finalizado</option>
              <option value="postponed">Postergado</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Notas</label>
            <textarea
              value={editForm.notes}
              onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })}
              className={`${INPUT} min-h-20 resize-none`}
              placeholder="Detalle interno o aclaracion..."
            />
          </div>

          <Button onClick={guardarEdicion} disabled={actualizarDetalles.isPending} className="w-full">
            {actualizarDetalles.isPending ? 'Guardando...' : 'Guardar detalles'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
