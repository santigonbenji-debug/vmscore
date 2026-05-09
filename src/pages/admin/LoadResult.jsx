import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMatch, useSaveResult } from '../../hooks/useMatches'
import { useAuth } from '../../hooks/useAuth'
import { useTeamPlayers } from '../../hooks/useRosters'
import { useAddMatchLineupPlayer, useMatchLineups, useRemoveMatchLineupPlayer } from '../../hooks/useLineups'
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
const LINEUP_FORM = { team_id: '', player_id: '', manual_player_name: '', role: 'starter', shirt_number: '', position: '' }

function teamLabel(match, teamId) {
  if (teamId === match.home_team_id) return match.home_team_short_name ?? match.home_team_name ?? 'Local'
  if (teamId === match.away_team_id) return match.away_team_short_name ?? match.away_team_name ?? 'Visitante'
  return 'Equipo'
}

function LineupTeam({ title, players, onRemove, canRemove }) {
  const starters = players.filter((player) => player.role === 'starter')
  const substitutes = players.filter((player) => player.role === 'substitute')

  return (
    <div className="bg-surface-800/50 rounded-xl p-3 space-y-3">
      <h3 className="font-bold text-xs">{title}</h3>
      {[['Titulares', starters], ['Suplentes', substitutes]].map(([label, rows]) => (
        <div key={label}>
          <p className="text-xs font-semibold text-zinc-500 mb-1">{label}</p>
          {rows.length === 0 ? (
            <p className="text-xs text-zinc-600">Sin jugadores cargados</p>
          ) : (
            <div className="space-y-1">
              {rows.map((player) => (
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
      ))}
    </div>
  )
}

export default function LoadResult() {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const { isSuperAdmin, isLigaAdmin, isClubAdmin, teamId } = useAuth()
  const { data, isLoading } = useMatch(matchId)
  const guardarResultado = useSaveResult()

  const [homeScore, setHomeScore] = useState('')
  const [awayScore, setAwayScore] = useState('')
  const [events, setEvents] = useState([])
  const [nuevoEvento, setNuevoEvento] = useState(EVENTO_VACIO)
  const [mvpPlayerName, setMvpPlayerName] = useState('')
  const [mvpTeamId, setMvpTeamId] = useState('')
  const [mvpPlayerId, setMvpPlayerId] = useState('')
  const [lineupForm, setLineupForm] = useState(LINEUP_FORM)

  const puedeCargarResultado = isSuperAdmin || isLigaAdmin
  const miEquipoId = isClubAdmin ? teamId : null

  const { data: lineups = [], isLoading: loadingLineups } = useMatchLineups(matchId)
  const addLineupPlayer = useAddMatchLineupPlayer()
  const removeLineupPlayer = useRemoveMatchLineupPlayer()

  const { data: homePlayers = [] } = useTeamPlayers(data?.match?.home_team_id)
  const { data: awayPlayers = [] } = useTeamPlayers(data?.match?.away_team_id)

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

  const guardando = guardarResultado.isPending
  const currentLineupPlayers = lineups.filter((player) => !miEquipoId || player.team_id === miEquipoId)

  return (
    <div className="px-4 py-6 space-y-5">
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
            Solo podes cargar formacion y eventos de tu equipo. El resultado final lo confirma el organizador.
          </p>
        </div>
      )}

      {puedeCargarResultado && (
        <div className="bg-surface-900 rounded-xl border border-surface-800 shadow-sm p-5">
          <p className="text-xs font-semibold text-zinc-500 text-center mb-4 uppercase tracking-wide">
            Resultado
          </p>
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
          <h2 className="font-bold text-sm text-zinc-100">Formacion</h2>
          <p className="text-xs text-zinc-500 mt-1">Titulares y suplentes de este partido.</p>
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
            <select value={lineupForm.role}
              onChange={(event) => setLineupForm({ ...lineupForm, role: event.target.value })}
              className="border border-surface-700 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="starter">Titular</option>
              <option value="substitute">Suplente</option>
            </select>
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
            + Agregar a formacion
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
                canRemove
              />
            ))}
          </div>
        )}
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

      <Button onClick={guardar} disabled={guardando} className="w-full" size="lg">
        {guardando ? 'Guardando...' : 'Guardar'}
      </Button>

      {guardarResultado.isError && (
        <p className="text-red-400 text-xs text-center">
          Error al guardar. Revisa los datos e intenta de nuevo.
        </p>
      )}
    </div>
  )
}
