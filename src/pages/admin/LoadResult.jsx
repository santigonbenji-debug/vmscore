import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMatch, useSaveLiveMatchData, useSaveResult } from '../../hooks/useMatches'
import { useAuth } from '../../hooks/useAuth'
import { useTeamPlayers } from '../../hooks/useRosters'
import { useAddActiveRosterToMatch, useAddMatchLineupPlayer, useMatchLineups, useRemoveMatchLineupPlayer } from '../../hooks/useLineups'
import {
  useLiveSyncEvents,
  useMatchLiveLink,
  useCreateManualLiveEvent,
  useSaveCopaFacilMatchLink,
  useSyncCopaFacilLive,
  useSaveMatchLiveLink,
  useSearchCopaFacilMatches,
  useSearchLocosVmMatches,
  useSyncLocosVmLive,
  useUpdateLiveSyncEvent,
} from '../../hooks/useLiveSync'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'

const TIPOS_EVENTO = [
  { value: 'goal', label: 'Gol' },
  { value: 'own_goal', label: 'Gol en contra' },
  { value: 'penalty_goal', label: 'Penal convertido' },
  { value: 'yellow_card', label: 'Tarjeta amarilla' },
  { value: 'red_card', label: 'Tarjeta roja' },
  { value: 'yellow_red_card', label: 'Doble amarilla' },
  { value: 'substitution', label: 'Sustitucion' },
]

const EVENTO_VACIO = { team_id: '', player_id: '', player_name: '', event_type: 'goal', minute: '' }
const LINEUP_FORM = { team_id: '', player_id: '', manual_player_name: '', role: 'called_up', shirt_number: '', position: '' }

function teamLabel(match, teamId) {
  if (teamId === match.home_team_id) return match.home_team_short_name ?? match.home_team_name ?? 'Local'
  if (teamId === match.away_team_id) return match.away_team_short_name ?? match.away_team_name ?? 'Visitante'
  return 'Equipo'
}

function LineupTeam({ title, players, onRemove, onLoadRoster, canRemove, loadingRoster }) {
  return (
    <div className="bg-surface-800/50 rounded-xl p-3 space-y-3">
      <h3 className="font-bold text-xs">{title}</h3>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-zinc-500">Convocados</p>
        {onLoadRoster && (
          <button type="button" onClick={onLoadRoster} disabled={loadingRoster}
            className="rounded-lg border border-primary/25 bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary disabled:opacity-50">
            {loadingRoster ? 'Cargando...' : 'Cargar plantel activo'}
          </button>
        )}
      </div>
      {players.length === 0 ? (
        <p className="text-xs text-zinc-600">Sin jugadores convocados</p>
      ) : (
        <div className="space-y-1">
          {players.map((player) => (
            <div key={player.id} className="flex items-center justify-between gap-2 text-xs bg-surface-900 rounded-lg px-2 py-1.5">
              <span className="truncate">
                {player.shirt_number ? `#${player.shirt_number} ` : ''}{player.player_name}
                {player.position ? ` - ${player.position}` : ''}
              </span>
              {canRemove && (
                <button onClick={() => onRemove(player)} className="text-red-400 font-medium shrink-0">
                  Quitar
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function LoadResult() {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const { isSuperAdmin, isOrganizationAdmin, isLigaAdmin, isClubAdmin, teamId } = useAuth()
  const { data, isLoading } = useMatch(matchId)
  const guardarEnVivoMutation = useSaveLiveMatchData()
  const guardarResultado = useSaveResult()

  const [homeScore, setHomeScore] = useState('')
  const [awayScore, setAwayScore] = useState('')
  const [events, setEvents] = useState([])
  const [nuevoEvento, setNuevoEvento] = useState(EVENTO_VACIO)
  const [mvpPlayerName, setMvpPlayerName] = useState('')
  const [mvpTeamId, setMvpTeamId] = useState('')
  const [mvpPlayerId, setMvpPlayerId] = useState('')
  const [lineupForm, setLineupForm] = useState(LINEUP_FORM)
  const [locosInput, setLocosInput] = useState('')
  const [locosMessage, setLocosMessage] = useState('')
  const [copaFacilMessage, setCopaFacilMessage] = useState('')
  const [manualLiveEvent, setManualLiveEvent] = useState({ teamId: '', minute: '' })
  const [manualLiveMessage, setManualLiveMessage] = useState('')
  const [lineupMessage, setLineupMessage] = useState('')

  const puedeCargarResultado = isSuperAdmin || isOrganizationAdmin || isLigaAdmin
  const puedeSincronizar = isSuperAdmin
  const puedePublicarEnVivo = isSuperAdmin || isOrganizationAdmin || isLigaAdmin
  const miEquipoId = isClubAdmin ? teamId : null

  const { data: lineups = [], isLoading: loadingLineups } = useMatchLineups(matchId)
  const addLineupPlayer = useAddMatchLineupPlayer()
  const addActiveRoster = useAddActiveRosterToMatch()
  const removeLineupPlayer = useRemoveMatchLineupPlayer()

  const { data: homePlayers = [] } = useTeamPlayers(data?.match?.home_team_id, data?.match?.gender)
  const { data: awayPlayers = [] } = useTeamPlayers(data?.match?.away_team_id, data?.match?.gender)
  const { data: liveLink } = useMatchLiveLink(matchId)
  const { data: copaFacilLiveLink } = useMatchLiveLink(matchId, 'copafacil')
  const { data: liveEvents = [] } = useLiveSyncEvents(matchId)
  const saveLiveLink = useSaveMatchLiveLink()
  const searchLocosVm = useSearchLocosVmMatches()
  const searchCopaFacil = useSearchCopaFacilMatches()
  const saveCopaFacilLink = useSaveCopaFacilMatchLink()
  const syncLocosVm = useSyncLocosVmLive()
  const updateLiveEvent = useUpdateLiveSyncEvent()
  const createManualLiveEvent = useCreateManualLiveEvent()
  const syncCopaFacilLive = useSyncCopaFacilLive()

  useEffect(() => {
    if (!data?.match) return
    const m = data.match
    if (m.home_score !== null && m.home_score !== undefined) setHomeScore(String(m.home_score))
    if (m.away_score !== null && m.away_score !== undefined) setAwayScore(String(m.away_score))
    setMvpPlayerName(m.mvp_player_name ?? '')
    setMvpTeamId(m.mvp_team_id ?? '')
    setMvpPlayerId(m.mvp_player_id ?? '')
    setEvents((data.events ?? []).map((event) => ({
      team_id: event.team_id,
      player_id: event.player_id ?? '',
      player_name: event.player_name ?? '',
      event_type: event.event_type,
      minute: event.minute ?? '',
      notes: event.notes ?? '',
    })))
  }, [data])

  useEffect(() => {
    if (liveLink?.external_url || liveLink?.external_match_id) {
      setLocosInput(liveLink.external_url || liveLink.external_match_id)
    }
  }, [liveLink])

  // ⚠️ Todos los hooks DEBEN llamarse antes de cualquier return temprano.
  const match = data?.match
  const miEquipoEsLocal = miEquipoId && match ? miEquipoId === match.home_team_id : false
  const miEquipoEsVisitante = miEquipoId && match ? miEquipoId === match.away_team_id : false
  const tengoAcceso = puedeCargarResultado || miEquipoEsLocal || miEquipoEsVisitante

  const allowedTeamIds = useMemo(() => {
    if (!match) return []
    if (!miEquipoId) return [match.home_team_id, match.away_team_id]
    return [miEquipoId]
  }, [match, miEquipoId])

  const playersByTeam = useMemo(() => {
    if (!match) return {}
    const filterByGender = (players) => players.filter((player) => {
      if (!match.gender) return true
      return (player.gender ?? 'masculino') === match.gender
    })
    return {
      [match.home_team_id]: filterByGender(homePlayers),
      [match.away_team_id]: filterByGender(awayPlayers),
    }
  }, [awayPlayers, homePlayers, match])

  const lineupOptions = useMemo(() => {
    const fromLineups = lineups
      .filter((player) => !nuevoEvento.team_id || player.team_id === nuevoEvento.team_id)
      .map((player) => ({
        id: player.player_id || `manual:${player.id}`,
        name: player.player_name,
        team_id: player.team_id,
      }))

    const fromRoster = (playersByTeam[nuevoEvento.team_id] ?? [])
      .filter((player) => player.is_active !== false)
      .map((player) => ({ id: player.id, name: player.display_name, team_id: nuevoEvento.team_id }))

    const seen = new Set()
    return [...fromLineups, ...fromRoster].filter((player) => {
      const key = `${player.team_id}:${player.id}:${player.name}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [lineups, nuevoEvento.team_id, playersByTeam])

  // Returns tempranos AHORA, despues de todos los hooks.
  if (isLoading) return <Spinner className="py-24" />
  if (!data?.match) {
    return <p className="px-4 py-8 text-zinc-400 text-sm text-center">Partido no encontrado.</p>
  }

  if (!tengoAcceso) {
    return (
      <div className="px-4 py-8 text-center text-zinc-500">
        <p className="font-medium">Sin acceso a este partido</p>
        <p className="text-sm mt-1">Tu equipo no participa en este partido.</p>
        <button onClick={() => navigate(-1)} className="text-primary text-sm font-medium mt-4">
          Volver
        </button>
      </div>
    )
  }

  async function agregarLineupPlayer() {
    if (!lineupForm.team_id || (!lineupForm.player_id && !lineupForm.manual_player_name)) return
    const selectedPlayer = (playersByTeam[lineupForm.team_id] ?? []).find((player) => player.id === lineupForm.player_id)
    await addLineupPlayer.mutateAsync({
      matchId,
      teamId: lineupForm.team_id,
      playerId: lineupForm.player_id,
      manualPlayerName: lineupForm.player_id ? '' : lineupForm.manual_player_name,
      role: lineupForm.role,
      shirtNumber: lineupForm.shirt_number || selectedPlayer?.shirt_number || '',
      position: lineupForm.position || selectedPlayer?.position || '',
      sortOrder: lineups.length,
    })
    setLineupForm({ ...LINEUP_FORM, team_id: lineupForm.team_id, role: lineupForm.role })
  }

  async function cargarPlantelActivo(teamId) {
    const roster = playersByTeam[teamId] ?? []
    const result = await addActiveRoster.mutateAsync({ matchId, teamId, players: roster })
    setLineupMessage(result.added > 0
      ? `${result.added} convocado${result.added === 1 ? '' : 's'} agregado${result.added === 1 ? '' : 's'}.`
      : 'El plantel activo ya esta cargado o no tiene jugadores disponibles.')
  }

  async function quitarLineupPlayer(player) {
    await removeLineupPlayer.mutateAsync({ id: player.id, matchId })
  }

  function agregarEvento() {
    if (!nuevoEvento.team_id || !nuevoEvento.event_type) return
    const selected = lineupOptions.find((player) => player.id === nuevoEvento.player_id)
    setEvents([...events, {
      ...nuevoEvento,
      player_id: selected?.id?.startsWith('manual:') ? '' : nuevoEvento.player_id,
      player_name: selected?.name ?? nuevoEvento.player_name,
      minute: nuevoEvento.minute ? parseInt(nuevoEvento.minute) : null,
    }])
    setNuevoEvento({ ...EVENTO_VACIO, team_id: nuevoEvento.team_id })
  }

  function quitarEvento(idx) {
    const event = events[idx]
    if (miEquipoId && event.team_id !== miEquipoId) return
    setEvents(events.filter((_, i) => i !== idx))
  }

  async function vincularLocosVm() {
    if (!match || !locosInput.trim()) return
    const link = await saveLiveLink.mutateAsync({
      matchId,
      externalMatchId: locosInput,
      externalUrl: locosInput,
    })
    await syncLocosVm.mutateAsync({ match, link })
    setLocosMessage('Partido vinculado. La sincronizacion queda guardada para futuras lecturas.')
  }

  async function sincronizarLocosVm() {
    if (!match || !liveLink) return
    await syncLocosVm.mutateAsync({ match, link: liveLink })
    setLocosMessage('Datos recibidos de Locos VM aplicados al partido.')
  }

  async function buscarPartidosLocosVm() {
    if (!match) return
    await searchLocosVm.mutateAsync({ match })
  }

  async function vincularCandidatoLocosVm(candidate) {
    if (!match) return
    setLocosInput(candidate.id)
    const link = await saveLiveLink.mutateAsync({
      matchId,
      externalMatchId: candidate.id,
      externalUrl: candidate.streamUrl || candidate.vodUrl || '',
    })
    await syncLocosVm.mutateAsync({ match, link })
    setLocosMessage('Partido vinculado. La sincronizacion queda guardada para futuras lecturas.')
  }

  function aplicarMarcadorVivo() {
    if (!liveLink) return
    if (liveLink.last_home_score !== null && liveLink.last_home_score !== undefined) {
      setHomeScore(String(liveLink.last_home_score))
    }
    if (liveLink.last_away_score !== null && liveLink.last_away_score !== undefined) {
      setAwayScore(String(liveLink.last_away_score))
    }
  }

  async function aplicarEventoVivo(event) {
    if (event.event_type === 'goal' && event.team_id) {
      setEvents((current) => [...current, {
        team_id: event.team_id,
        player_id: '',
        player_name: 'Jugador por confirmar',
        event_type: 'goal',
        minute: event.minute ?? '',
        notes: event.title,
      }])
    }

    if (event.event_type === 'finish') {
      if (event.home_score !== null && event.home_score !== undefined) setHomeScore(String(event.home_score))
      if (event.away_score !== null && event.away_score !== undefined) setAwayScore(String(event.away_score))
    }

    await updateLiveEvent.mutateAsync({ id: event.id, matchId, status: 'applied' })
  }

  async function descartarEventoVivo(event) {
    await updateLiveEvent.mutateAsync({ id: event.id, matchId, status: 'dismissed' })
  }

  async function publicarGolEnVivo() {
    if (!match || !manualLiveEvent.teamId) return
    const result = await createManualLiveEvent.mutateAsync({
      match,
      teamId: manualLiveEvent.teamId,
      minute: manualLiveEvent.minute,
    })
    setManualLiveMessage(
      result.pushWarning
        ? `Gol publicado para ${teamLabel(match, manualLiveEvent.teamId)}. La alerta no pudo entregarse todavia y queda pendiente de reintento.`
        : `Gol publicado para ${teamLabel(match, manualLiveEvent.teamId)} y alerta enviada.`
    )
    setManualLiveEvent((current) => ({ ...current, minute: '' }))
  }

  async function sincronizarCopaFacil() {
    if (!match) return
    await syncCopaFacilLive.mutateAsync({ matchId: match.id })
    setCopaFacilMessage('Datos recibidos de Copa Facil aplicados al partido.')
  }

  async function buscarPartidosCopaFacil() {
    if (!match) return
    await searchCopaFacil.mutateAsync({ match })
  }

  async function vincularCandidatoCopaFacil(candidate) {
    if (!match) return
    await saveCopaFacilLink.mutateAsync({ match, candidate })
    await syncCopaFacilLive.mutateAsync({ matchId: match.id })
    setCopaFacilMessage('Partido vinculado a Copa Facil. La sincronizacion automatica queda activa.')
  }

  async function guardar() {
    if (puedeCargarResultado && (homeScore === '' || awayScore === '')) {
      return alert('Ingresa los goles de ambos equipos.')
    }

    await guardarResultado.mutateAsync({
      matchId,
      homeScore: puedeCargarResultado ? homeScore : match.home_score,
      awayScore: puedeCargarResultado ? awayScore : match.away_score,
      events,
      mvpPlayerName: mvpPlayerName || null,
      mvpTeamId: mvpTeamId || null,
      mvpPlayerId: mvpPlayerId || null,
    })
    navigate(-1)
  }

  async function guardarEnVivo() {
    if ((homeScore === '') !== (awayScore === '')) {
      return alert('Para publicar marcador en vivo, carga ambos goles o deja ambos vacios.')
    }

    await guardarEnVivoMutation.mutateAsync({
      matchId,
      homeScore,
      awayScore,
      events,
      mvpPlayerName: mvpPlayerName || null,
      mvpTeamId: mvpTeamId || null,
      mvpPlayerId: mvpPlayerId || null,
    })
  }

  const guardando = guardarResultado.isPending || guardarEnVivoMutation.isPending
  const currentLineupPlayers = lineups.filter((player) => !miEquipoId || player.team_id === miEquipoId)
  const pendingLiveEvents = liveEvents.filter((event) => event.status === 'pending')
  const liveScoreReady = liveLink?.last_home_score !== null && liveLink?.last_home_score !== undefined &&
    liveLink?.last_away_score !== null && liveLink?.last_away_score !== undefined

  return (
    <div className="px-4 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] space-y-5">
      <div>
        <button onClick={() => navigate(-1)}
          className="text-xs text-primary font-medium mb-4 flex items-center gap-1">
          Volver
        </button>
        <h1 className="text-xl font-bold mb-1 text-zinc-100">
          {isClubAdmin ? 'Cargar mis eventos' : 'Cargar Resultado'}
        </h1>
        <p className="text-xs text-zinc-400">{match.league_name} - {match.phase_name}</p>
      </div>

      {isClubAdmin && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p className="text-sm text-blue-700 font-medium mb-1">
            Cargando datos de: {miEquipoEsLocal
              ? (match.home_team_short_name ?? match.home_team_name)
              : (match.away_team_short_name ?? match.away_team_name)}
          </p>
          <p className="text-xs text-blue-500">
            Solo podes cargar convocados y eventos de tu equipo. El resultado final lo confirma el organizador.
          </p>
        </div>
      )}

      {puedeSincronizar && (
        <div className="bg-surface-900 rounded-xl border border-surface-800 shadow-sm p-5 space-y-4">
          <div>
            <h2 className="font-bold text-sm text-zinc-100">Sincronizacion Locos VM</h2>
            <p className="text-xs text-zinc-500 mt-1">
              Si la fuente entrega datos, se aplican al marcador automaticamente. Copa Facil es la fuente recomendada.
            </p>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={buscarPartidosLocosVm}
            disabled={searchLocosVm.isPending}
            className="w-full"
          >
            {searchLocosVm.isPending ? 'Buscando partidos...' : 'Buscar partido en Locos VM'}
          </Button>

          {searchLocosVm.data?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                Coincidencias encontradas
              </p>
              {searchLocosVm.data.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => vincularCandidatoLocosVm(candidate)}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    liveLink?.external_match_id === candidate.id
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : 'border-surface-700 bg-surface-800/40 hover:border-primary/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-zinc-100">
                        {candidate.homeTeam?.shortName ?? candidate.homeTeam?.name} vs {candidate.awayTeam?.shortName ?? candidate.awayTeam?.name}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">
                        {candidate.date || 'sin fecha'} {candidate.time ? `· ${candidate.time}` : ''}
                        {candidate.venue ? ` · ${candidate.venue}` : ''}
                      </p>
                      {candidate.description && (
                        <p className="text-xs text-zinc-600 mt-1 truncate">{candidate.description}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-extrabold text-zinc-100">
                        {candidate.homeScore ?? '-'} - {candidate.awayScore ?? '-'}
                      </p>
                      <p className={`text-[10px] font-bold uppercase mt-1 ${
                        liveLink?.external_match_id === candidate.id ? 'text-emerald-300' : 'text-primary'
                      }`}>
                        {liveLink?.external_match_id === candidate.id ? 'Vinculado' : 'Vincular'}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {searchLocosVm.isSuccess && searchLocosVm.data?.length === 0 && (
            <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              No encontre una coincidencia clara. Podes pegar el ID o link manual si lo conseguis.
            </p>
          )}

          {searchLocosVm.isError && (
            <p className="text-xs text-red-400">
              {searchLocosVm.error?.message || 'No se pudo buscar en Locos VM.'}
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              type="text"
              value={locosInput}
              onChange={(event) => setLocosInput(event.target.value)}
              placeholder="ID o link del partido en Locos VM"
              className="w-full border border-surface-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <Button
              size="sm"
              onClick={liveLink ? sincronizarLocosVm : vincularLocosVm}
              disabled={saveLiveLink.isPending || syncLocosVm.isPending || !locosInput.trim()}
            >
              {syncLocosVm.isPending ? 'Leyendo...' : liveLink ? 'Actualizar desde Locos VM' : 'Vincular'}
            </Button>
          </div>

          {liveLink && (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-wide text-emerald-300">Vinculado a Locos VM</p>
                <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-black uppercase text-emerald-200">
                  Activo
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-zinc-500 truncate">ID externo: {liveLink.external_match_id}</p>
                  <p className="text-sm font-bold text-zinc-100 mt-1">
                    {liveScoreReady
                      ? `${liveLink.last_home_score} - ${liveLink.last_away_score}`
                      : 'Marcador sin leer'}
                    {liveLink.last_minute !== null && liveLink.last_minute !== undefined ? ` · ${liveLink.last_minute}'` : ''}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {liveLink.last_status ? `Estado: ${liveLink.last_status}` : 'Todavia no se sincronizo.'}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={aplicarMarcadorVivo} disabled={!liveScoreReady}>
                  Usar marcador
                </Button>
              </div>
            </div>
          )}

          {locosMessage && (
            <p className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-zinc-200">
              {locosMessage}
            </p>
          )}

          {pendingLiveEvents.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                Novedades pendientes
              </p>
              {pendingLiveEvents.map((event) => (
                <div key={event.id} className="rounded-xl border border-primary/25 bg-primary/5 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-zinc-100">{event.title}</p>
                      <p className="text-xs text-zinc-500 mt-1">
                        {event.minute !== null && event.minute !== undefined ? `${event.minute}' · ` : ''}
                        {event.home_score !== null && event.home_score !== undefined && event.away_score !== null && event.away_score !== undefined
                          ? `${event.home_score} - ${event.away_score}`
                          : 'Sin marcador'}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => aplicarEventoVivo(event)}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white"
                      >
                        Aplicar
                      </button>
                      <button
                        type="button"
                        onClick={() => descartarEventoVivo(event)}
                        className="rounded-lg bg-surface-800 px-3 py-1.5 text-xs font-bold text-zinc-300"
                      >
                        Descartar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {syncLocosVm.isError && (
            <p className="text-xs text-red-400">
              {syncLocosVm.error?.message || 'No se pudo leer Locos VM.'}
            </p>
          )}
        </div>
      )}

      {puedeSincronizar && (
        <div className="bg-surface-900 rounded-xl border border-surface-800 shadow-sm p-5 space-y-4">
          <div>
            <h2 className="font-bold text-sm text-zinc-100">Sincronizacion Copa Facil</h2>
            <p className="text-xs text-zinc-500 mt-1">
              Al vincularlo, Copa Facil actualiza marcador, inicio y final automaticamente. No necesita aprobacion manual.
            </p>
          </div>

          {match.external_provider === 'copafacil' && match.external_match_id ? (
            <>
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs font-black uppercase tracking-wide text-emerald-300">Vinculado a Copa Facil</p>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-black uppercase text-emerald-200">
                    Activo
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-500 truncate">ID externo: {match.external_match_id}</p>
                    <p className="text-sm font-bold text-zinc-100 mt-1">
                      {copaFacilLiveLink?.last_home_score !== null && copaFacilLiveLink?.last_home_score !== undefined &&
                      copaFacilLiveLink?.last_away_score !== null && copaFacilLiveLink?.last_away_score !== undefined
                        ? `${copaFacilLiveLink.last_home_score} - ${copaFacilLiveLink.last_away_score}`
                        : 'Marcador sin leer'}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {copaFacilLiveLink?.last_status
                        ? `Estado: ${copaFacilLiveLink.last_status}`
                        : 'Todavia no se sincronizo.'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={sincronizarCopaFacil}
                    disabled={syncCopaFacilLive.isPending}
                  >
                    {syncCopaFacilLive.isPending ? 'Sincronizando...' : 'Sincronizar ahora'}
                  </Button>
                </div>
              </div>

              {syncCopaFacilLive.data && (
                <p className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-zinc-200">
                  Datos de Copa Facil sincronizados en el partido.
                </p>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                Este partido todavia no tiene vinculo con Copa Facil. Busca una coincidencia para dejarlo sincronizado.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={buscarPartidosCopaFacil}
                disabled={searchCopaFacil.isPending}
                className="w-full"
              >
                {searchCopaFacil.isPending ? 'Buscando partidos...' : 'Buscar partido en Copa Facil'}
              </Button>
            </div>
          )}

          {searchCopaFacil.data?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                Coincidencias de Copa Facil
              </p>
              {searchCopaFacil.data.map((candidate) => (
                <button
                  key={`${candidate.source_id}-${candidate.external_match_id}`}
                  type="button"
                  onClick={() => vincularCandidatoCopaFacil(candidate)}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    match.external_match_id === candidate.external_match_id
                      ? 'border-emerald-500/40 bg-emerald-500/10'
                      : 'border-surface-700 bg-surface-800/40 hover:border-primary/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-zinc-100">
                        {teamLabel(match, candidate.mapped_home_team_id) || candidate.external_home_team_id}
                        {' vs '}
                        {teamLabel(match, candidate.mapped_away_team_id) || candidate.external_away_team_id}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">
                        {candidate.source_label} - Fecha {candidate.round ?? '-'}
                        {candidate.scheduled_at ? ` - ${new Date(candidate.scheduled_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ' - fecha a definir'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-extrabold text-zinc-100">
                        {candidate.home_score ?? '-'} - {candidate.away_score ?? '-'}
                      </p>
                      <p className="mt-1 text-[10px] font-bold uppercase text-primary">
                        Vincular
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {searchCopaFacil.isSuccess && searchCopaFacil.data?.length === 0 && (
            <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              No encontre coincidencias claras. Revisa que la fuente de Copa Facil este guardada y que los equipos esten mapeados.
            </p>
          )}

          {copaFacilMessage && (
            <p className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-zinc-200">
              {copaFacilMessage}
            </p>
          )}

          {syncCopaFacilLive.isError && (
            <p className="text-xs text-red-400">
              {syncCopaFacilLive.error?.message || 'No se pudo leer Copa Facil.'}
            </p>
          )}

          {searchCopaFacil.isError && (
            <p className="text-xs text-red-400">
              {searchCopaFacil.error?.message || 'No se pudo buscar en Copa Facil.'}
            </p>
          )}

          {saveCopaFacilLink.isError && (
            <p className="text-xs text-red-400">
              {saveCopaFacilLink.error?.message || 'No se pudo vincular Copa Facil.'}
            </p>
          )}
        </div>
      )}

      {puedePublicarEnVivo && (
        <div className="bg-surface-900 rounded-xl border border-surface-800 shadow-sm p-5 space-y-4">
          <div>
            <h2 className="font-bold text-sm text-zinc-100">Eventos en vivo manuales</h2>
            <p className="text-xs text-zinc-500 mt-1">
              Publica el gol, incrementa el marcador en vivo y envia push a quienes siguen cualquiera de los equipos.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_6rem_auto]">
            <select
              value={manualLiveEvent.teamId}
              onChange={(event) => setManualLiveEvent({ ...manualLiveEvent, teamId: event.target.value })}
              className="w-full border border-surface-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Equipo que marco</option>
              <option value={match.home_team_id}>{teamLabel(match, match.home_team_id)}</option>
              <option value={match.away_team_id}>{teamLabel(match, match.away_team_id)}</option>
            </select>
            <input
              type="number"
              min="0"
              max="150"
              value={manualLiveEvent.minute}
              onChange={(event) => setManualLiveEvent({ ...manualLiveEvent, minute: event.target.value })}
              placeholder="Min."
              className="w-full border border-surface-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <Button
              size="sm"
              onClick={publicarGolEnVivo}
              disabled={!manualLiveEvent.teamId || createManualLiveEvent.isPending}
            >
              {createManualLiveEvent.isPending ? 'Publicando...' : 'Publicar gol'}
            </Button>
          </div>

          {manualLiveMessage && (
            <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              {manualLiveMessage}
            </p>
          )}

          {createManualLiveEvent.isError && (
            <p className="text-xs text-red-400">
              {createManualLiveEvent.error?.message || 'No se pudo publicar el evento en vivo.'}
            </p>
          )}
        </div>
      )}

      {puedeCargarResultado && (
        <div className="bg-surface-900 rounded-xl border border-surface-800 shadow-sm p-5">
          <p className="text-xs font-semibold text-zinc-500 text-center mb-4 uppercase tracking-wide">
            Resultado
          </p>
          {match.status !== 'finished' && (
            <p className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              Para un partido en curso podes cargar marcador y eventos ahora, y finalizarlo despues.
            </p>
          )}
          <div className="flex items-center justify-center gap-4">
            <div className="flex-1 text-center">
              <p className="font-bold text-sm mb-2">{match.home_team_short_name ?? match.home_team_name}</p>
              <input type="number" min="0" value={homeScore}
                onChange={(event) => setHomeScore(event.target.value)}
                className="w-16 h-16 text-3xl font-bold text-center border-2 border-surface-700 rounded-xl focus:border-primary focus:outline-none mx-auto block" />
            </div>
            <span className="text-2xl font-bold text-zinc-600">-</span>
            <div className="flex-1 text-center">
              <p className="font-bold text-sm mb-2">{match.away_team_short_name ?? match.away_team_name}</p>
              <input type="number" min="0" value={awayScore}
                onChange={(event) => setAwayScore(event.target.value)}
                className="w-16 h-16 text-3xl font-bold text-center border-2 border-surface-700 rounded-xl focus:border-primary focus:outline-none mx-auto block" />
            </div>
          </div>
        </div>
      )}

      <div className="bg-surface-900 rounded-xl border border-surface-800 shadow-sm p-5 space-y-4">
        <div>
          <h2 className="font-bold text-sm text-zinc-100">Convocados</h2>
          <p className="text-xs text-zinc-500 mt-1">Carga el plantel activo y ajusta solo las excepciones de este partido.</p>
        </div>

        <div className="border border-dashed border-surface-700 rounded-xl p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <select value={lineupForm.team_id}
              onChange={(event) => setLineupForm({ ...lineupForm, team_id: event.target.value, player_id: '', manual_player_name: '' })}
              className="border border-surface-700 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="">Equipo</option>
              {allowedTeamIds.map((id) => (
                <option key={id} value={id}>{teamLabel(match, id)}</option>
              ))}
            </select>
            <div className="flex items-center rounded-lg border border-surface-700 px-3 py-2 text-xs font-semibold text-zinc-300">
              Convocado
            </div>
          </div>

          <select value={lineupForm.player_id}
            onChange={(event) => {
              const player = (playersByTeam[lineupForm.team_id] ?? []).find((item) => item.id === event.target.value)
              setLineupForm({
                ...lineupForm,
                player_id: event.target.value,
                manual_player_name: '',
                shirt_number: player?.shirt_number ?? '',
                position: player?.position ?? '',
              })
            }}
            disabled={!lineupForm.team_id}
            className="w-full border border-surface-700 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">Seleccionar jugador del plantel...</option>
            {(playersByTeam[lineupForm.team_id] ?? []).filter((player) => player.is_active !== false).map((player) => (
              <option key={player.id} value={player.id}>{player.display_name}</option>
            ))}
          </select>

          <div className="grid grid-cols-[1fr_4.5rem] gap-2">
            <input type="text" value={lineupForm.manual_player_name} placeholder="Jugador manual"
              onChange={(event) => setLineupForm({ ...lineupForm, manual_player_name: event.target.value, player_id: '' })}
              className="border border-surface-700 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <input type="number" min="0" value={lineupForm.shirt_number} placeholder="Nro"
              onChange={(event) => setLineupForm({ ...lineupForm, shirt_number: event.target.value })}
              className="border border-surface-700 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <input type="text" value={lineupForm.position} placeholder="Posicion"
            onChange={(event) => setLineupForm({ ...lineupForm, position: event.target.value })}
            className="w-full border border-surface-700 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />

          <Button size="sm" variant="outline" onClick={agregarLineupPlayer}
            disabled={!lineupForm.team_id || (!lineupForm.player_id && !lineupForm.manual_player_name) || addLineupPlayer.isPending}
            className="w-full">
            + Agregar convocado
          </Button>
        </div>

        {loadingLineups ? <Spinner className="py-6" /> : (
          <div className="grid gap-3">
            {allowedTeamIds.map((id) => (
              <LineupTeam
                key={id}
                title={teamLabel(match, id)}
                players={currentLineupPlayers.filter((player) => player.team_id === id)}
                onRemove={quitarLineupPlayer}
                onLoadRoster={() => cargarPlantelActivo(id)}
                loadingRoster={addActiveRoster.isPending}
                canRemove
              />
            ))}
          </div>
        )}
        {lineupMessage && <p className="text-xs text-zinc-400">{lineupMessage}</p>}
      </div>

      {puedeCargarResultado && (
        <div className="bg-surface-900 rounded-xl border border-surface-800 shadow-sm p-5">
          <h2 className="font-bold text-sm mb-4 text-zinc-100">Jugador de la Fecha (MVP)</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Equipo</label>
              <select value={mvpTeamId}
                onChange={(event) => { setMvpTeamId(event.target.value); setMvpPlayerName(''); setMvpPlayerId('') }}
                className="w-full border border-surface-700 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">Sin MVP</option>
                <option value={match.home_team_id}>{teamLabel(match, match.home_team_id)}</option>
                <option value={match.away_team_id}>{teamLabel(match, match.away_team_id)}</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Jugador</label>
              <select value={mvpPlayerId}
                onChange={(event) => {
                  const selected = lineups.find((player) => player.player_id === event.target.value)
                  setMvpPlayerId(event.target.value)
                  setMvpPlayerName(selected?.player_name ?? '')
                }}
                disabled={!mvpTeamId}
                className="w-full border border-surface-700 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">Seleccionar...</option>
                {lineups.filter((player) => player.team_id === mvpTeamId && player.player_id).map((player) => (
                  <option key={player.id} value={player.player_id}>{player.player_name}</option>
                ))}
              </select>
            </div>
          </div>
          <input type="text" value={mvpPlayerName} placeholder="O escribir manualmente"
            onChange={(event) => { setMvpPlayerName(event.target.value); setMvpPlayerId('') }}
            className="mt-3 w-full border border-surface-700 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      )}

      <div className="bg-surface-900 rounded-xl border border-surface-800 shadow-sm p-5">
        <h2 className="font-bold text-sm mb-4 text-zinc-100">
          {isClubAdmin ? 'Mis eventos' : 'Eventos del Partido'}
        </h2>

        {events.length > 0 && (
          <div className="space-y-2 mb-4">
            {events.map((event, idx) => {
              const esLocal = event.team_id === match.home_team_id
              const tipoLabel = TIPOS_EVENTO.find((type) => type.value === event.event_type)?.label ?? event.event_type
              const puedoQuitar = !miEquipoId || event.team_id === miEquipoId

              return (
                <div key={`${event.team_id}-${event.event_type}-${idx}`}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs
                    ${event.team_id === miEquipoId ? 'bg-primary/5' : 'bg-surface-800/50'}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span>{tipoLabel}</span>
                    <span className="text-zinc-500">-</span>
                    <span className="font-medium truncate">{event.player_name || '-'}</span>
                    {event.minute && <span className="text-zinc-500">{event.minute}'</span>}
                    <span className={`font-semibold ${esLocal ? 'text-primary' : 'text-zinc-300'}`}>
                      {teamLabel(match, event.team_id)}
                    </span>
                  </div>
                  {puedoQuitar && (
                    <button onClick={() => quitarEvento(idx)}
                      className="text-red-400 font-medium ml-2">
                      Quitar
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="border border-dashed border-surface-700 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-zinc-500">Agregar evento</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Equipo</label>
              <select value={nuevoEvento.team_id}
                onChange={(event) => setNuevoEvento({ ...EVENTO_VACIO, team_id: event.target.value })}
                className="w-full border border-surface-700 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">-</option>
                {allowedTeamIds.map((id) => (
                  <option key={id} value={id}>{teamLabel(match, id)}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Tipo</label>
              <select value={nuevoEvento.event_type}
                onChange={(event) => setNuevoEvento({ ...nuevoEvento, event_type: event.target.value })}
                className="w-full border border-surface-700 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                {TIPOS_EVENTO.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Jugador</label>
              <select value={nuevoEvento.player_id}
                onChange={(event) => {
                  const player = lineupOptions.find((item) => item.id === event.target.value)
                  setNuevoEvento({ ...nuevoEvento, player_id: event.target.value, player_name: player?.name ?? '' })
                }}
                disabled={!nuevoEvento.team_id}
                className="w-full border border-surface-700 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">Seleccionar...</option>
                {lineupOptions.map((player) => (
                  <option key={`${player.team_id}-${player.id}-${player.name}`} value={player.id}>{player.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Minuto</label>
              <input type="number" min="0" max="150" value={nuevoEvento.minute} placeholder="42"
                onChange={(event) => setNuevoEvento({ ...nuevoEvento, minute: event.target.value })}
                className="w-full border border-surface-700 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          <input type="text" value={nuevoEvento.player_name} placeholder="O escribir jugador manualmente"
            onChange={(event) => setNuevoEvento({ ...nuevoEvento, player_name: event.target.value, player_id: '' })}
            className="w-full border border-surface-700 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />

          <Button size="sm" variant="outline" onClick={agregarEvento}
            disabled={!nuevoEvento.team_id} className="w-full">
            + Agregar evento
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        {puedeCargarResultado && match.status !== 'finished' && match.status !== 'postponed' && match.status !== 'cancelled' && (
          <Button onClick={guardarEnVivo} disabled={guardando} className="w-full" size="lg" variant="outline">
            {guardarEnVivoMutation.isPending ? 'Publicando...' : 'Guardar datos en vivo'}
          </Button>
        )}
        <Button onClick={guardar} disabled={guardando} className="w-full" size="lg">
          {guardarResultado.isPending ? 'Guardando...' : puedeCargarResultado ? 'Guardar resultado final' : 'Guardar'}
        </Button>
      </div>

      {guardarResultado.isError && (
        <p className="text-red-400 text-xs text-center">
          Error al guardar. Revisa los datos e intenta de nuevo.
        </p>
      )}
      {guardarEnVivoMutation.isError && (
        <p className="text-red-400 text-xs text-center">
          {guardarEnVivoMutation.error?.message || 'No se pudieron guardar los datos en vivo.'}
        </p>
      )}
    </div>
  )
}
