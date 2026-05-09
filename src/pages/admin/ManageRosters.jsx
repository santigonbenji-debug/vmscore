import { useEffect, useMemo, useState } from 'react'
import { useLeagues } from '../../hooks/useLeagues'
import { useTeams } from '../../hooks/useTeams'
import {
  useAddTeamToLeague,
  useCreatePlayer,
  useCreateStaffMember,
  useDeletePlayer,
  useLeagueTeams,
  useRemoveTeamFromLeague,
  useTeamPlayers,
  useTeamStaff,
  useUpdatePlayer,
} from '../../hooks/useRosters'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'

const PLAYER_FORM = {
  display_name: '',
  shirt_number: '',
  position: '',
  is_active: true,
}

const STAFF_FORM = {
  name: '',
  role: '',
  phone: '',
}

export default function ManageRosters() {
  const [leagueId, setLeagueId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [teamToAdd, setTeamToAdd] = useState('')
  const [playerForm, setPlayerForm] = useState(PLAYER_FORM)
  const [editingPlayer, setEditingPlayer] = useState(null)
  const [staffForm, setStaffForm] = useState(STAFF_FORM)

  const { data: leagues = [], isLoading: loadingLeagues } = useLeagues()
  const selectedLeague = leagues.find((league) => league.id === leagueId)
  const { data: leagueTeams = [], isLoading: loadingLeagueTeams } = useLeagueTeams(leagueId)
  const { data: allTeams = [] } = useTeams({ sportId: selectedLeague?.sport_id })
  const { data: players = [], isLoading: loadingPlayers } = useTeamPlayers(teamId)
  const { data: staff = [] } = useTeamStaff(teamId)

  const addTeam = useAddTeamToLeague()
  const removeTeam = useRemoveTeamFromLeague()
  const createPlayer = useCreatePlayer()
  const updatePlayer = useUpdatePlayer()
  const deletePlayer = useDeletePlayer()
  const createStaff = useCreateStaffMember()

  useEffect(() => {
    if (!leagueId && leagues.length > 0) setLeagueId(leagues[0].id)
  }, [leagueId, leagues])

  useEffect(() => {
    if (!teamId && leagueTeams.length > 0) setTeamId(leagueTeams[0].team_id)
    if (teamId && leagueTeams.length > 0 && !leagueTeams.some((item) => item.team_id === teamId)) {
      setTeamId(leagueTeams[0].team_id)
    }
    if (leagueTeams.length === 0) setTeamId('')
  }, [leagueTeams, teamId])

  const selectedTeam = useMemo(() => {
    const fromLeague = leagueTeams.find((item) => item.team_id === teamId)
    if (fromLeague) return {
      id: fromLeague.team_id,
      name: fromLeague.team_name,
      short_name: fromLeague.team_short_name,
    }
    return allTeams.find((team) => team.id === teamId)
  }, [allTeams, leagueTeams, teamId])

  const availableTeams = allTeams.filter((team) => !leagueTeams.some((item) => item.team_id === team.id))

  async function agregarEquipoALiga() {
    if (!leagueId || !teamToAdd) return
    await addTeam.mutateAsync({ leagueId, teamId: teamToAdd })
    setTeamId(teamToAdd)
    setTeamToAdd('')
  }

  async function quitarEquipoDeLiga(item) {
    if (!window.confirm(`Quitar ${item.team_name} de esta liga? El plantel del equipo se conserva.`)) return
    await removeTeam.mutateAsync({ leagueId, leagueTeamId: item.id })
  }

  function editarJugador(player) {
    setEditingPlayer(player)
    setPlayerForm({
      display_name: player.display_name,
      shirt_number: player.shirt_number ?? '',
      position: player.position ?? '',
      is_active: player.is_active ?? true,
    })
  }

  function limpiarJugador() {
    setEditingPlayer(null)
    setPlayerForm(PLAYER_FORM)
  }

  async function guardarJugador() {
    if (!teamId || !playerForm.display_name) return
    const payload = {
      team_id: teamId,
      display_name: playerForm.display_name,
      shirt_number: playerForm.shirt_number ? parseInt(playerForm.shirt_number) : null,
      position: playerForm.position || null,
      is_active: playerForm.is_active,
    }

    if (editingPlayer) await updatePlayer.mutateAsync({ id: editingPlayer.id, ...payload })
    else await createPlayer.mutateAsync(payload)
    limpiarJugador()
  }

  async function borrarJugador(player) {
    if (!window.confirm(`Eliminar ${player.display_name}?`)) return
    await deletePlayer.mutateAsync({ id: player.id, team_id: teamId })
  }

  async function guardarStaff() {
    if (!teamId || !staffForm.name) return
    await createStaff.mutateAsync({
      team_id: teamId,
      name: staffForm.name,
      role: staffForm.role || null,
      phone: staffForm.phone || null,
      is_active: true,
    })
    setStaffForm(STAFF_FORM)
  }

  const guardandoJugador = createPlayer.isPending || updatePlayer.isPending

  return (
    <div className="px-4 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Planteles</h1>
        <p className="text-xs text-zinc-500 mt-1">Los jugadores pertenecen al equipo. La liga solo agrupa equipos participantes.</p>
      </div>

      <div className="bg-surface-900 rounded-xl border border-surface-800 shadow-sm p-4 space-y-3">
        <label className="text-xs font-semibold text-zinc-400 block">Liga</label>
        {loadingLeagues ? <Spinner className="py-5" /> : (
          <select value={leagueId}
            onChange={(e) => { setLeagueId(e.target.value); setTeamId(''); setTeamToAdd('') }}
            className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none">
            {leagues.map((league) => (
              <option key={league.id} value={league.id}>
                {league.name} {league.season ? `- ${league.season}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {leagueId && (
        <div className="bg-surface-900 rounded-xl border border-surface-800 shadow-sm p-4 space-y-3">
          <div>
            <h2 className="font-bold text-sm text-zinc-100">Equipos de la liga</h2>
            <p className="text-xs text-zinc-500">Agrega equipos a la liga; sus jugadores se editan desde el equipo.</p>
          </div>

          <div className="flex gap-2">
            <select value={teamToAdd}
              onChange={(e) => setTeamToAdd(e.target.value)}
              className="flex-1 rounded-lg px-3 py-2.5 text-sm focus:outline-none">
              <option value="">Agregar equipo...</option>
              {availableTeams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
            <Button size="sm" onClick={agregarEquipoALiga} disabled={!teamToAdd || addTeam.isPending}>
              Agregar
            </Button>
          </div>

          {loadingLeagueTeams ? <Spinner className="py-5" /> : (
            <div className="space-y-2">
              {leagueTeams.map((item) => (
                <div key={item.id}
                  className={`border rounded-xl p-3 flex items-center justify-between gap-3
                    ${teamId === item.team_id ? 'border-primary bg-primary/5' : 'border-surface-800 bg-surface-800/50'}`}>
                  <button onClick={() => setTeamId(item.team_id)} className="flex-1 min-w-0 text-left">
                    <p className="font-semibold text-sm truncate">{item.team_name}</p>
                    <p className="text-xs text-zinc-500">{item.players_count ?? 0} jugadores cargados</p>
                  </button>
                  <button onClick={() => quitarEquipoDeLiga(item)}
                    className="text-xs text-red-400 font-medium shrink-0">
                    Quitar
                  </button>
                </div>
              ))}
              {leagueTeams.length === 0 && (
                <p className="text-center text-zinc-500 py-6 text-sm">Esta liga todavia no tiene equipos.</p>
              )}
            </div>
          )}
        </div>
      )}

      {selectedTeam && (
        <div className="bg-surface-900 rounded-xl border border-surface-800 shadow-sm p-4 space-y-4">
          <div>
            <h2 className="font-bold text-sm text-zinc-100">{selectedTeam.name}</h2>
            <p className="text-xs text-zinc-500">Plantel del equipo</p>
          </div>

          <div className="border border-dashed border-surface-700 rounded-xl p-3 space-y-3">
            <p className="text-xs font-semibold text-zinc-500">{editingPlayer ? 'Editar jugador' : 'Nuevo jugador'}</p>
            <div className="grid grid-cols-[1fr_5rem] gap-2">
              <input type="text" value={playerForm.display_name} placeholder="Nombre del jugador"
                onChange={(e) => setPlayerForm({ ...playerForm, display_name: e.target.value })}
                className="rounded-lg px-3 py-2.5 text-sm focus:outline-none" />
              <input type="number" min="0" value={playerForm.shirt_number} placeholder="Nro"
                onChange={(e) => setPlayerForm({ ...playerForm, shirt_number: e.target.value })}
                className="rounded-lg px-3 py-2.5 text-sm focus:outline-none" />
            </div>
            <input type="text" value={playerForm.position} placeholder="Posicion"
              onChange={(e) => setPlayerForm({ ...playerForm, position: e.target.value })}
              className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none" />
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input type="checkbox" checked={playerForm.is_active}
                onChange={(e) => setPlayerForm({ ...playerForm, is_active: e.target.checked })} />
              Activo
            </label>
            <div className="flex gap-2">
              {editingPlayer && (
                <Button variant="outline" onClick={limpiarJugador} className="flex-1">
                  Cancelar
                </Button>
              )}
              <Button onClick={guardarJugador} disabled={guardandoJugador || !playerForm.display_name} className="flex-1">
                {guardandoJugador ? 'Guardando...' : editingPlayer ? 'Guardar cambios' : 'Crear jugador'}
              </Button>
            </div>
          </div>

          {loadingPlayers ? <Spinner className="py-6" /> : players.length === 0 ? (
            <p className="text-center text-zinc-500 py-8 text-sm">Todavia no hay jugadores cargados.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {players.map((player) => (
                <div key={player.id} className="flex items-center justify-between gap-3 py-2.5">
                  <button onClick={() => editarJugador(player)} className="flex-1 min-w-0 text-left">
                    <p className="font-semibold text-sm truncate">{player.display_name}</p>
                    <p className="text-xs text-zinc-500">
                      {player.shirt_number ? `#${player.shirt_number}` : 'Sin numero'}
                      {player.position ? ` - ${player.position}` : ''}
                      {!player.is_active ? ' - Inactivo' : ''}
                    </p>
                  </button>
                  <button onClick={() => borrarJugador(player)}
                    className="text-xs text-red-400 font-medium shrink-0">
                    Borrar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedTeam && (
        <div className="bg-surface-900 rounded-xl border border-surface-800 shadow-sm p-4 space-y-3">
          <div>
            <h2 className="font-bold text-sm text-zinc-100">Cuerpo tecnico</h2>
            <p className="text-xs text-zinc-500">Tambien pertenece al equipo.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={staffForm.name} placeholder="Nombre"
              onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
              className="rounded-lg px-3 py-2.5 text-sm focus:outline-none" />
            <input type="text" value={staffForm.role} placeholder="Rol"
              onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
              className="rounded-lg px-3 py-2.5 text-sm focus:outline-none" />
          </div>
          <input type="text" value={staffForm.phone} placeholder="Telefono"
            onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
            className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none" />
          <Button onClick={guardarStaff} disabled={!staffForm.name || createStaff.isPending} className="w-full">
            {createStaff.isPending ? 'Guardando...' : 'Agregar al cuerpo tecnico'}
          </Button>
          {staff.length > 0 && (
            <div className="divide-y divide-gray-50">
              {staff.map((member) => (
                <div key={member.id} className="py-2">
                  <p className="font-semibold text-sm">{member.name}</p>
                  <p className="text-xs text-zinc-500">{member.role ?? 'Sin rol'}{member.phone ? ` - ${member.phone}` : ''}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
