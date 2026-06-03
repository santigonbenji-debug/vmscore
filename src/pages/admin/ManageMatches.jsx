import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarPlus, DatabaseZap, SlidersHorizontal } from 'lucide-react'
import { useLeagues, usePhases } from '../../hooks/useLeagues'
import { useLeagueTeams } from '../../hooks/useRosters'
import {
  useCreateMatch,
  useDeleteMatch,
  useMatches,
  usePostponeMatch,
  useSaveMatchScore,
  useUpdateMatchDetails,
} from '../../hooks/useMatches'
import {
  useExternalMatchArchive,
  useExternalSources,
  usePublishExternalArchiveMatch,
} from '../../hooks/useExternalSources'
import { useVenues } from '../../hooks/useVenues'
import { useReferees } from '../../hooks/useReferees'
import { useAuth } from '../../hooks/useAuth'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Spinner from '../../components/ui/Spinner'
import TeamLogo from '../../components/teams/TeamLogo'
import { formatFechaHora, matchStatusDetail, utcToInputLocal } from '../../lib/helpers'
import { LEG_LABELS } from '../../lib/competitionFormats'

const INPUT = 'w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30'

const FORM_VACIO = {
  phase_id: '',
  home_team_id: '',
  away_team_id: '',
  venue_id: '',
  referee_id: '',
  scheduledAtLocal: '',
  round: '',
  leg: '1',
  mode: 'scheduled',
  home_score: '',
  away_score: '',
}

const EDIT_FORM_VACIO = {
  scheduledAtLocal: '',
  round: '',
  venue_id: '',
  referee_id: '',
  status: 'scheduled',
  notes: '',
  home_technical_director: '',
  away_technical_director: '',
  home_score: '',
  away_score: '',
  leg: '1',
}

const STATUS_VARIANT = {
  scheduled: 'default',
  in_progress: 'live',
  finished: 'success',
  postponed: 'warning',
  cancelled: 'danger',
}

export default function ManageMatches() {
  const { isSuperAdmin, organizationId } = useAuth()
  const [params, setParams] = useSearchParams()
  const [ligaId, setLigaId] = useState(() => params.get('liga') ?? '')
  const [faseid, setFaseId] = useState(() => params.get('fase') ?? '')
  const [fechaFiltro, setFechaFiltro] = useState('all')
  const [modal, setModal] = useState(false)
  const [modalEditar, setModalEditar] = useState(false)
  const [form, setForm] = useState(FORM_VACIO)
  const [editando, setEditando] = useState(null)
  const [editForm, setEditForm] = useState(EDIT_FORM_VACIO)

  const scopedOrgId = isSuperAdmin ? undefined : organizationId
  const { data: ligas = [] } = useLeagues({ organizationId: scopedOrgId, approvalStatus: 'approved' })
  const { data: fases = [] } = usePhases(ligaId)
  const { data: partidos = [], isLoading } = useMatches({ phaseId: faseid || undefined })
  const { data: fuentesExternas = [] } = useExternalSources()
  const ligaSeleccionada = ligas.find((liga) => liga.id === ligaId)
  const faseSeleccionada = fases.find((fase) => fase.id === faseid)
  const fuenteSeleccionada = useMemo(() => {
    if (!ligaId || !faseid) return null
    return fuentesExternas.find((fuente) => (
      fuente.league_id === ligaId &&
      fuente.phase_id === faseid &&
      fuente.provider === 'copafacil'
    )) ?? fuentesExternas.find((fuente) => fuente.league_id === ligaId && fuente.phase_id === faseid) ?? null
  }, [faseid, fuentesExternas, ligaId])
  const { data: archivoExterno = [] } = useExternalMatchArchive(fuenteSeleccionada?.id)
  const isKnockout = faseSeleccionada?.type === 'knockout' || ligaSeleccionada?.format === 'playoffs'
  const isTwoLegged = ligaSeleccionada?.leg_mode === 'two_legged'
  const activeOrganizationId = isSuperAdmin ? ligaSeleccionada?.organization_id : organizationId
  const { data: equiposInscritos = [] } = useLeagueTeams(ligaId)
  const { data: canchas = [] } = useVenues({ organizationId: activeOrganizationId })
  const { data: arbitros = [] } = useReferees({ organizationId: activeOrganizationId })

  const crearPartido = useCreateMatch()
  const borrarPartido = useDeleteMatch()
  const postergarPartido = usePostponeMatch()
  const actualizarDetalles = useUpdateMatchDetails()
  const guardarMarcador = useSaveMatchScore()
  const publicarImportado = usePublishExternalArchiveMatch()

  const equiposPorId = useMemo(() => {
    const map = new Map()
    equiposInscritos.forEach((equipo) => {
      map.set(equipo.team_id, equipo)
    })
    return map
  }, [equiposInscritos])

  const partidosOficialesKey = useMemo(() => {
    const keys = new Set()
    partidos.forEach((partido) => {
      const teams = [partido.home_team_id, partido.away_team_id].filter(Boolean).sort().join('|')
      if (!teams) return
      const legPart = isTwoLegged ? `|leg:${partido.leg ?? 1}` : ''
      if (partido.round !== null && partido.round !== undefined) {
        keys.add(`${teams}|round:${partido.round}${legPart}`)
      }
      if (partido.scheduled_at) {
        keys.add(`${teams}|day:${new Date(partido.scheduled_at).toISOString().slice(0, 10)}`)
      }
    })
    return keys
  }, [isTwoLegged, partidos])

  const partidosImportadosPendientes = useMemo(() => (
    archivoExterno
      .filter((partido) => {
        if (partido.computed_match_id || !partido.mapped_home_team_id || !partido.mapped_away_team_id) return false
        const teams = [partido.mapped_home_team_id, partido.mapped_away_team_id].sort().join('|')
        const legPart = isTwoLegged ? `|leg:${partido.leg ?? 1}` : ''
        const byRound = partido.round !== null && partido.round !== undefined
          ? partidosOficialesKey.has(`${teams}|round:${partido.round}${legPart}`)
          : false
        const byDay = partido.scheduled_at
          ? partidosOficialesKey.has(`${teams}|day:${new Date(partido.scheduled_at).toISOString().slice(0, 10)}`)
          : false
        return !byRound && !byDay
      })
      .map((partido) => ({
        ...partido,
        id: `external-${partido.id}`,
        archive_id: partido.id,
        source_kind: 'external',
        phase_id: faseid,
        home_team_id: partido.mapped_home_team_id,
        away_team_id: partido.mapped_away_team_id,
        home_team_name: equiposPorId.get(partido.mapped_home_team_id)?.team_name ?? partido.external_home_team_id,
        home_team_short_name: equiposPorId.get(partido.mapped_home_team_id)?.team_short_name ?? null,
        home_team_logo_url: equiposPorId.get(partido.mapped_home_team_id)?.team_logo_url ?? null,
        away_team_name: equiposPorId.get(partido.mapped_away_team_id)?.team_name ?? partido.external_away_team_id,
        away_team_short_name: equiposPorId.get(partido.mapped_away_team_id)?.team_short_name ?? null,
        away_team_logo_url: equiposPorId.get(partido.mapped_away_team_id)?.team_logo_url ?? null,
      }))
  ), [archivoExterno, equiposPorId, faseid, isTwoLegged, partidosOficialesKey])

  const partidosVisibles = useMemo(() => ([
    ...partidos.map((partido) => ({ ...partido, source_kind: 'official' })),
    ...partidosImportadosPendientes,
  ]), [partidos, partidosImportadosPendientes])

  const fechasDisponibles = useMemo(() => {
    const values = [...new Set(partidosVisibles.map((partido) => partido.round).filter((round) => round !== null && round !== undefined))]
    return values.sort((a, b) => Number(a) - Number(b))
  }, [partidosVisibles])

  const partidosFiltrados = useMemo(() => {
    if (fechaFiltro === 'all') return partidosVisibles
    if (fechaFiltro === 'none') return partidosVisibles.filter((partido) => partido.round === null || partido.round === undefined)
    return partidosVisibles.filter((partido) => String(partido.round) === fechaFiltro)
  }, [fechaFiltro, partidosVisibles])

  const partidosPorFecha = useMemo(() => {
    const grupos = {}
    partidosFiltrados.forEach((partido) => {
      const key = isKnockout ? (faseSeleccionada?.id ?? 'knockout') : partido.round ?? 'none'
      if (!grupos[key]) {
        grupos[key] = {
          key,
          label: isKnockout ? (faseSeleccionada?.name ?? 'Eliminatoria') : partido.round ? `Fecha ${partido.round}` : 'Sin fecha asignada',
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
  }, [faseSeleccionada?.id, faseSeleccionada?.name, isKnockout, partidosFiltrados])

  useEffect(() => {
    if (ligas.length === 0) return
    if (ligaId && !ligas.some((liga) => liga.id === ligaId)) {
      setLigaId('')
      setFaseId('')
    }
  }, [ligaId, ligas])

  useEffect(() => {
    const next = new URLSearchParams(params)
    if (ligaId) next.set('liga', ligaId)
    else next.delete('liga')
    if (faseid) next.set('fase', faseid)
    else next.delete('fase')
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
  }, [faseid, ligaId, params, setParams])

  useEffect(() => {
    if (!ligaId || faseid || fases.length === 0) return
    setFaseId(fases[0].id)
  }, [faseid, fases, ligaId])

  useEffect(() => {
    if (!faseid) return
    if (fases.length > 0 && !fases.some((fase) => fase.id === faseid)) {
      setFaseId(fases[0]?.id ?? '')
    }
  }, [faseid, fases])

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
      leg: partido.leg ?? '1',
      venue_id: partido.venue_id ?? '',
      referee_id: partido.referee_id ?? '',
      status: partido.status ?? 'scheduled',
      notes: partido.notes ?? '',
      home_technical_director: partido.home_technical_director ?? '',
      away_technical_director: partido.away_technical_director ?? '',
      home_score: partido.home_score ?? '',
      away_score: partido.away_score ?? '',
    })
    setModalEditar(true)
  }

  async function guardar() {
    if (!form.phase_id || !form.home_team_id || !form.away_team_id || !form.scheduledAtLocal) return
    if (form.home_team_id === form.away_team_id) {
      return alert('Local y visitante no pueden ser el mismo equipo.')
    }
    const historico = form.mode === 'finished'
    if (historico && (form.home_score === '' || form.away_score === '')) {
      return alert('Para cargar un historico finalizado, completa el resultado de ambos equipos.')
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
      leg: isTwoLegged ? parseInt(form.leg) : null,
      status: historico ? 'finished' : 'scheduled',
      home_score: historico ? parseInt(form.home_score) : null,
      away_score: historico ? parseInt(form.away_score) : null,
      notes: historico ? 'Historico cargado manualmente' : null,
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
    if (editForm.status !== 'postponed' && !editForm.scheduledAtLocal) {
      alert('La fecha y hora son obligatorias. Usa Postergado solo si la nueva fecha queda a definir.')
      return
    }
    const hasScoreInput = editForm.home_score !== '' || editForm.away_score !== ''
    if (hasScoreInput && (editForm.home_score === '' || editForm.away_score === '')) {
      alert('Para guardar marcador, carga los goles de ambos equipos.')
      return
    }
    await actualizarDetalles.mutateAsync({
      id: editando.id,
      scheduledAtLocal: editForm.scheduledAtLocal,
      round: editForm.round === '' ? null : parseInt(editForm.round),
      venue_id: editForm.venue_id || null,
      referee_id: editForm.referee_id || null,
      status: editForm.status,
      leg: isTwoLegged ? parseInt(editForm.leg) : null,
      notes: editForm.notes || null,
      home_technical_director: editForm.home_technical_director || null,
      away_technical_director: editForm.away_technical_director || null,
    })
    if (hasScoreInput) {
      await guardarMarcador.mutateAsync({
        id: editando.id,
        homeScore: editForm.home_score,
        awayScore: editForm.away_score,
        status: editForm.status === 'finished' ? 'finished' : 'in_progress',
      })
    }
    setModalEditar(false)
    setEditando(null)
    setEditForm(EDIT_FORM_VACIO)
  }

  async function guardarResultadoRapido(status = 'finished') {
    if (!editando) return
    if (editForm.home_score === '' || editForm.away_score === '') {
      alert('Carga los goles de los dos equipos para guardar el marcador.')
      return
    }
    if (editForm.status !== 'postponed' && !editForm.scheduledAtLocal) {
      alert('La fecha y hora son obligatorias. Usa Postergado solo si la nueva fecha queda a definir.')
      return
    }

    await actualizarDetalles.mutateAsync({
      id: editando.id,
      scheduledAtLocal: editForm.scheduledAtLocal,
      round: editForm.round === '' ? null : parseInt(editForm.round),
      venue_id: editForm.venue_id || null,
      referee_id: editForm.referee_id || null,
      status,
      leg: isTwoLegged ? parseInt(editForm.leg) : null,
      notes: editForm.notes || null,
      home_technical_director: editForm.home_technical_director || null,
      away_technical_director: editForm.away_technical_director || null,
    })
    await guardarMarcador.mutateAsync({
      id: editando.id,
      homeScore: editForm.home_score,
      awayScore: editForm.away_score,
      status,
    })
    setModalEditar(false)
    setEditando(null)
    setEditForm(EDIT_FORM_VACIO)
  }

  async function eliminar(partido) {
    if (!window.confirm('Eliminar este partido?')) return
    await borrarPartido.mutateAsync(partido.id)
  }

  async function suspender(partido) {
    const confirmar = window.confirm(
      'Marcar este partido como suspendido y dejar la nueva fecha a definir?'
    )
    if (!confirmar) return
    await postergarPartido.mutateAsync({ id: partido.id })
  }

  async function publicarPartidoImportado(partido) {
    await publicarImportado.mutateAsync({
      id: partido.archive_id,
      sourceId: fuenteSeleccionada?.id,
      leagueId: ligaId,
    })
  }

  async function publicarImportadosVisibles() {
    const pendientes = partidosFiltrados.filter((partido) => partido.source_kind === 'external')
    for (const partido of pendientes) {
      await publicarImportado.mutateAsync({
        id: partido.archive_id,
        sourceId: fuenteSeleccionada?.id,
        leagueId: ligaId,
      })
    }
  }

  const guardando = crearPartido.isPending
  const externosFiltrados = partidosFiltrados.filter((partido) => partido.source_kind === 'external')

  return (
    <div className="px-4 py-6 pb-28">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Partidos</h1>
          <p className="mt-1 text-xs text-zinc-500">Carga cruces, horarios, sedes y resultados de una competencia.</p>
        </div>
        {faseid && <Button size="sm" onClick={abrirCrear}>+ Nuevo Partido</Button>}
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-xs font-semibold text-zinc-400">Competencia</label>
        <select value={ligaId} onChange={(event) => handleLigaChange(event.target.value)} className={INPUT}>
          <option value="">Selecciona una competencia...</option>
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

      {ligaSeleccionada && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-surface-800 bg-surface-900 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-zinc-100">{ligaSeleccionada.name}</p>
            <p className="text-xs text-zinc-500">{ligaSeleccionada.format === 'playoffs' ? 'Eliminacion directa' : 'Fixture por fechas'}</p>
          </div>
          <Link to={`/admin/competencia/${ligaSeleccionada.id}`} className="shrink-0 text-xs font-bold text-primary">
            Equipos y fases
          </Link>
        </div>
      )}

      {faseid && fuenteSeleccionada && partidosImportadosPendientes.length > 0 && (
        <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 p-3">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-white">
              <DatabaseZap className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-zinc-100">Cruces importados listos</p>
              <p className="mt-0.5 text-xs text-zinc-400">
                Hay partidos guardados desde la fuente externa que todavia no estan publicados como partidos editables.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={publicarImportadosVisibles}
                  disabled={publicarImportado.isPending || externosFiltrados.length === 0}
                >
                  {publicarImportado.isPending ? 'Publicando...' : `Publicar visibles (${externosFiltrados.length})`}
                </Button>
                <Link to="/admin/importar" className="rounded-lg bg-surface-800 px-3 py-2 text-xs font-bold text-zinc-200">
                  Ver importacion
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {!ligaId && (
        <p className="py-16 text-center text-sm text-zinc-500">Selecciona una competencia para ver los partidos</p>
      )}
      {ligaId && fases.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">Esta competencia no tiene fases. Crealas desde su administracion.</p>
      )}
      {faseid && isLoading && <Spinner className="py-12" />}
      {faseid && !isLoading && partidosVisibles.length === 0 && (
        <p className="py-12 text-center text-sm text-zinc-500">No hay partidos en esta fase todavia</p>
      )}

      {faseid && partidosVisibles.length > 0 && !isKnockout && (
        <div className="mb-4 rounded-xl border border-surface-800 bg-surface-900 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">{isKnockout ? 'Ronda' : 'Fecha'}</p>
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
                {isKnockout ? `Orden ${round}` : `Fecha ${round}`}
              </button>
            ))}
            {partidosVisibles.some((partido) => partido.round === null || partido.round === undefined) && (
              <button
                type="button"
                onClick={() => setFechaFiltro('none')}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${fechaFiltro === 'none' ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-300'}`}
              >
                {isKnockout ? 'Sin orden' : 'Sin fecha'}
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
                    <span className="text-xs text-zinc-500">
                      {partido.status === 'postponed'
                        ? 'Fecha nueva a definir'
                        : formatFechaHora(partido.scheduled_at)}
                      {isTwoLegged && partido.leg ? ` · ${LEG_LABELS[partido.leg] ?? `Partido ${partido.leg}`}` : ''}
                    </span>
                    <Badge variant={STATUS_VARIANT[partido.status] ?? 'default'}>
                      {matchStatusDetail(partido)}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-3 py-1">
                    <div className="flex min-w-0 items-center justify-end gap-2">
                      <span className="truncate text-right text-sm font-semibold text-zinc-100">{partido.home_team_short_name ?? partido.home_team_name}</span>
                      <TeamLogo logoUrl={partido.home_team_logo_url} name={partido.home_team_name} color={partido.home_primary_color} size="sm" />
                    </div>
                    <span className="text-sm font-bold text-zinc-500">
                      {(partido.status === 'finished' || partido.status === 'in_progress') &&
                      partido.home_score !== null &&
                      partido.away_score !== null
                        ? `${partido.home_score} - ${partido.away_score}`
                        : 'vs'}
                    </span>
                    <div className="flex min-w-0 items-center gap-2">
                      <TeamLogo logoUrl={partido.away_team_logo_url} name={partido.away_team_name} color={partido.away_primary_color} size="sm" />
                      <span className="truncate text-left text-sm font-semibold text-zinc-100">{partido.away_team_short_name ?? partido.away_team_name}</span>
                    </div>
                  </div>

                  <div className="mt-2 grid gap-1 text-xs text-zinc-500 sm:grid-cols-2">
                    <p className="truncate">Cancha: <span className="text-zinc-300">{partido.venue_name ?? 'Sin asignar'}</span></p>
                    <p className="truncate">Arbitro: <span className="text-zinc-300">{partido.referee_name ?? 'Sin asignar'}</span></p>
                    {(partido.home_technical_director || partido.away_technical_director) && (
                      <p className="truncate sm:col-span-2">
                        DT: <span className="text-zinc-300">{partido.home_technical_director ?? '-'}</span>
                        {' / '}
                        <span className="text-zinc-300">{partido.away_technical_director ?? '-'}</span>
                      </p>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {partido.source_kind === 'external' ? (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => publicarPartidoImportado(partido)}
                        disabled={publicarImportado.isPending}
                      >
                        {publicarImportado.isPending ? 'Publicando...' : 'Publicar en partidos'}
                      </Button>
                    ) : partido.status !== 'postponed' && partido.status !== 'cancelled' && (
                      <Button size="sm" variant="primary" onClick={() => abrirEditar(partido)}>
                        {partido.status === 'finished' ? 'Editar partido' : 'Cargar partido'}
                      </Button>
                    )}
                    {partido.source_kind !== 'external' && (
                      <>
                        <Link to={`/admin/resultado/${partido.id}`}>
                          <Button size="sm" variant="outline">
                            Eventos y convocados
                          </Button>
                        </Link>
                        {(partido.status === 'postponed' || partido.status === 'cancelled') && (
                          <Button size="sm" variant="secondary" onClick={() => abrirEditar(partido)}>
                            Editar detalles
                          </Button>
                        )}
                        {partido.status !== 'postponed' && partido.status !== 'cancelled' && (
                          <Button size="sm" variant="secondary" onClick={() => abrirEditar(partido)}>
                            Fecha/sede
                          </Button>
                        )}
                        {partido.status === 'scheduled' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => suspender(partido)}
                          >
                            Suspender
                          </Button>
                        )}
                        <button onClick={() => eliminar(partido)} className="ml-auto text-xs font-medium text-red-400 hover:text-red-300">
                          Borrar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Nuevo partido"
        eyebrow={isKnockout ? 'Cruce' : 'Fixture'}
        description="Carga un partido oficial con equipos inscriptos, fecha, horario y sede. Si el cruce ya existe, la app lo detecta."
        icon={<CalendarPlus className="h-5 w-5" />}
        size="lg"
        guide={[
          { title: 'Fase', text: 'Ronda o fecha donde va.' },
          { title: 'Equipos', text: 'Solo inscriptos en la competencia.' },
          { title: 'Modo', text: 'Programado o historico finalizado.' },
        ]}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-surface-800 bg-surface-900 p-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, mode: 'scheduled', home_score: '', away_score: '' })}
                className={`rounded-lg px-3 py-2 text-sm font-bold ${form.mode === 'scheduled' ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-300'}`}
              >
                Programado
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, mode: 'finished' })}
                className={`rounded-lg px-3 py-2 text-sm font-bold ${form.mode === 'finished' ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-300'}`}
              >
                Historico finalizado
              </button>
            </div>
            <p className="mt-2 px-1 text-xs text-zinc-500">
              Historico finalizado crea el partido con resultado final de una sola vez.
            </p>
          </div>

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
                {equiposInscritos.map((equipo) => <option key={equipo.team_id} value={equipo.team_id}>{equipo.team_name}</option>)}
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
              <label className="mb-1 block text-xs font-semibold text-zinc-400">{isKnockout ? 'Orden del cruce' : 'Fecha'}</label>
              <input
                type="number"
                value={form.round}
                placeholder={isKnockout ? '1' : '9'}
                onChange={(event) => setForm({ ...form, round: event.target.value })}
                className={INPUT}
              />
            </div>
          </div>

          {isTwoLegged && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Partido</label>
              <select value={form.leg} onChange={(event) => setForm({ ...form, leg: event.target.value })} className={INPUT}>
                <option value="1">Ida</option>
                <option value="2">Vuelta</option>
              </select>
            </div>
          )}

          {form.mode === 'finished' && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
              <p className="mb-3 text-sm font-black text-zinc-100">Resultado historico</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-400">Goles local *</label>
                  <input
                    type="number"
                    min="0"
                    value={form.home_score}
                    onChange={(event) => setForm({ ...form, home_score: event.target.value })}
                    className={`${INPUT} text-center text-lg font-black`}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-400">Goles visitante *</label>
                  <input
                    type="number"
                    min="0"
                    value={form.away_score}
                    onChange={(event) => setForm({ ...form, away_score: event.target.value })}
                    className={`${INPUT} text-center text-lg font-black`}
                  />
                </div>
              </div>
            </div>
          )}

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
            disabled={guardando || !form.phase_id || !form.home_team_id || !form.away_team_id || !form.scheduledAtLocal || (form.mode === 'finished' && (form.home_score === '' || form.away_score === ''))}
            className="w-full"
          >
            {guardando ? 'Guardando...' : form.mode === 'finished' ? 'Crear historico finalizado' : 'Crear partido'}
          </Button>
          {crearPartido.isError && (
            <p className="text-center text-xs text-red-400">Error al guardar. Verifica los datos.</p>
          )}
        </div>
      </Modal>

      <Modal
        open={modalEditar}
        onClose={() => setModalEditar(false)}
        title="Editar partido"
        eyebrow="Partido"
        description="Desde aca podes resolver lo mas usado: fecha, sede, estado y marcador. Eventos y convocados quedan en el boton avanzado."
        icon={<SlidersHorizontal className="h-5 w-5" />}
        size="lg"
        guide={[
          { title: 'Datos', text: 'Fecha, cancha y arbitro.' },
          { title: 'Marcador', text: 'Carga resultado sin salir.' },
          { title: 'Avanzado', text: 'Eventos y convocados aparte.' },
        ]}
      >
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
              <p className="mt-1 text-[10px] text-zinc-500">Solo puede quedar vacio si el partido esta postergado.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">{isKnockout ? 'Orden del cruce' : 'Fecha'}</label>
              <input
                type="number"
                value={editForm.round}
                placeholder={isKnockout ? '1' : '9'}
                onChange={(event) => setEditForm({ ...editForm, round: event.target.value })}
                className={INPUT}
              />
            </div>
          </div>

          {isTwoLegged && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Partido</label>
              <select value={editForm.leg} onChange={(event) => setEditForm({ ...editForm, leg: event.target.value })} className={INPUT}>
                <option value="1">Ida</option>
                <option value="2">Vuelta</option>
              </select>
            </div>
          )}

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

          {editando && editForm.status !== 'postponed' && editForm.status !== 'cancelled' && (
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-zinc-100">Marcador rapido</p>
                  <p className="text-xs text-zinc-400">Guarda el resultado sin abrir otra pantalla.</p>
                </div>
                <Link to={`/admin/resultado/${editando.id}`} className="text-xs font-bold text-primary">
                  Eventos
                </Link>
              </div>
              <div className="grid grid-cols-[1fr,5rem,5rem] items-end gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs text-zinc-400">{editando.home_team_short_name ?? editando.home_team_name}</p>
                  <p className="truncate text-xs text-zinc-400">{editando.away_team_short_name ?? editando.away_team_name}</p>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-500">Local</label>
                  <input
                    type="number"
                    min="0"
                    value={editForm.home_score}
                    onChange={(event) => setEditForm({ ...editForm, home_score: event.target.value })}
                    className={`${INPUT} text-center text-base font-black`}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase text-zinc-500">Visit.</label>
                  <input
                    type="number"
                    min="0"
                    value={editForm.away_score}
                    onChange={(event) => setEditForm({ ...editForm, away_score: event.target.value })}
                    className={`${INPUT} text-center text-base font-black`}
                  />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  variant="secondary"
                  onClick={() => guardarResultadoRapido('in_progress')}
                  disabled={actualizarDetalles.isPending || guardarMarcador.isPending || editForm.home_score === '' || editForm.away_score === ''}
                >
                  Guardar en vivo
                </Button>
                <Button
                  onClick={() => guardarResultadoRapido('finished')}
                  disabled={actualizarDetalles.isPending || guardarMarcador.isPending || editForm.home_score === '' || editForm.away_score === ''}
                >
                  Resultado final
                </Button>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Notas</label>
            <textarea
              value={editForm.notes}
              onChange={(event) => setEditForm({ ...editForm, notes: event.target.value })}
              className={`${INPUT} min-h-20 resize-none`}
              placeholder="Detalle interno o aclaracion..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">DT local</label>
              <input
                type="text"
                value={editForm.home_technical_director}
                onChange={(event) => setEditForm({ ...editForm, home_technical_director: event.target.value })}
                className={INPUT}
                placeholder="Director tecnico"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">DT visitante</label>
              <input
                type="text"
                value={editForm.away_technical_director}
                onChange={(event) => setEditForm({ ...editForm, away_technical_director: event.target.value })}
                className={INPUT}
                placeholder="Director tecnico"
              />
            </div>
          </div>

          <Button onClick={guardarEdicion} disabled={actualizarDetalles.isPending || guardarMarcador.isPending || (editForm.status !== 'postponed' && !editForm.scheduledAtLocal)} className="w-full">
            {actualizarDetalles.isPending || guardarMarcador.isPending ? 'Guardando...' : 'Guardar todo'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
