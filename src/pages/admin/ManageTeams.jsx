import { useState } from 'react'
import { useSports } from '../../hooks/useSports'
import { useTeams, useCreateTeam, useUpdateTeam, useDeleteTeam } from '../../hooks/useTeams'
import { useTeamPlayers, useCreatePlayer, useUpdatePlayer, useDeletePlayer } from '../../hooks/useRosters'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import TeamLogo from '../../components/teams/TeamLogo'

const FORM_VACIO = {
  sport_id: '',
  name: '',
  short_name: '',
  primary_color: '#E84E1B',
  secondary_color: '#FFFFFF',
}

const PLAYER_FORM = {
  display_name: '',
  shirt_number: '',
  position: '',
  gender: 'masculino',
  is_active: true,
}

const GENDERS = [
  { value: 'masculino', label: 'Masculino' },
  { value: 'femenino', label: 'Femenino' },
  { value: 'mixto', label: 'Mixto' },
]

function PlayersEditor({ teamId }) {
  const [form, setForm] = useState(PLAYER_FORM)
  const [editing, setEditing] = useState(null)
  const [genderFilter, setGenderFilter] = useState('masculino')

  const { data: players = [], isLoading } = useTeamPlayers(teamId)
  const createPlayer = useCreatePlayer()
  const updatePlayer = useUpdatePlayer()
  const deletePlayer = useDeletePlayer()

  function startEdit(player) {
    setEditing(player)
    setForm({
      display_name: player.display_name,
      shirt_number: player.shirt_number ?? '',
      position: player.position ?? '',
      gender: player.gender ?? genderFilter,
      is_active: player.is_active ?? true,
    })
  }

  function resetForm() {
    setEditing(null)
    setForm({ ...PLAYER_FORM, gender: genderFilter })
  }

  async function savePlayer() {
    if (!teamId || !form.display_name) return
    const payload = {
      team_id: teamId,
      display_name: form.display_name,
      shirt_number: form.shirt_number ? parseInt(form.shirt_number) : null,
      position: form.position || null,
      gender: form.gender,
      is_active: form.is_active,
    }

    if (editing) await updatePlayer.mutateAsync({ id: editing.id, ...payload })
    else await createPlayer.mutateAsync(payload)
    resetForm()
  }

  async function removePlayer(player) {
    if (!window.confirm(`Eliminar ${player.display_name}?`)) return
    await deletePlayer.mutateAsync({ id: player.id, team_id: teamId })
  }

  const isSaving = createPlayer.isPending || updatePlayer.isPending
  const filteredPlayers = players.filter((player) => (player.gender ?? 'masculino') === genderFilter)

  return (
    <div className="border-t border-surface-800 pt-4 space-y-3">
      <div>
        <h3 className="font-bold text-sm">Jugadores</h3>
        <p className="text-xs text-zinc-500">El deporte lo define el equipo; el plantel se separa por genero.</p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {GENDERS.map((gender) => (
          <button key={gender.value} type="button"
            onClick={() => { setGenderFilter(gender.value); setForm({ ...PLAYER_FORM, gender: gender.value }); setEditing(null) }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors
              ${genderFilter === gender.value ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-400 hover:bg-surface-700'}`}>
            {gender.label}
          </button>
        ))}
      </div>

      <div className="border border-dashed border-surface-700 rounded-xl p-3 space-y-3">
        <p className="text-xs font-semibold text-zinc-500">{editing ? 'Editar jugador' : 'Nuevo jugador'}</p>
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <input type="text" value={form.display_name} placeholder="Nombre del jugador"
            onChange={(event) => setForm({ ...form, display_name: event.target.value })}
            className="rounded-lg px-3 py-2.5 text-sm focus:outline-none" />
          <input type="number" min="0" value={form.shirt_number} placeholder="Nro"
            onChange={(event) => setForm({ ...form, shirt_number: event.target.value })}
            className="rounded-lg px-3 py-2.5 text-sm focus:outline-none" />
        </div>
        <input type="text" value={form.position} placeholder="Posicion"
          onChange={(event) => setForm({ ...form, position: event.target.value })}
          className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none" />
        <select value={form.gender}
          onChange={(event) => setForm({ ...form, gender: event.target.value })}
          className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none">
          {GENDERS.map((gender) => (
            <option key={gender.value} value={gender.value}>{gender.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input type="checkbox" checked={form.is_active}
            onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
          Activo
        </label>
        <div className="flex gap-2">
          {editing && (
            <Button variant="outline" onClick={resetForm} className="flex-1">
              Cancelar
            </Button>
          )}
          <Button onClick={savePlayer} disabled={isSaving || !form.display_name} className="flex-1">
            {isSaving ? 'Guardando...' : editing ? 'Guardar jugador' : 'Agregar jugador'}
          </Button>
        </div>
      </div>

      {isLoading ? <Spinner className="py-6" /> : filteredPlayers.length === 0 ? (
        <p className="text-center text-zinc-500 py-5 text-sm">Todavia no hay jugadores cargados para este genero.</p>
      ) : (
        <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
          {filteredPlayers.map((player) => (
            <div key={player.id} className="flex items-center justify-between gap-3 py-2.5">
              <button onClick={() => startEdit(player)} className="flex-1 min-w-0 text-left">
                <p className="font-semibold text-sm truncate">{player.display_name}</p>
                <p className="text-xs text-zinc-500">
                  {player.shirt_number ? `#${player.shirt_number}` : 'Sin numero'}
                  {player.position ? ` - ${player.position}` : ''}
                  {player.gender ? ` - ${GENDERS.find((g) => g.value === player.gender)?.label ?? player.gender}` : ''}
                  {!player.is_active ? ' - Inactivo' : ''}
                </p>
              </button>
              <button onClick={() => removePlayer(player)}
                className="text-xs text-red-400 font-medium shrink-0">
                Borrar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ManageTeams() {
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [logoFile, setLogoFile] = useState(null)
  const [filtro, setFiltro] = useState('')

  const { data: sports = [] } = useSports()
  const sportId = sports.find((sport) => sport.slug === filtro)?.id
  const { data: equipos = [], isLoading } = useTeams({ sportId })

  const crearEquipo = useCreateTeam()
  const editarEquipo = useUpdateTeam()
  const borrarEquipo = useDeleteTeam()

  function abrirCrear() {
    setEditando(null)
    setForm(FORM_VACIO)
    setLogoFile(null)
    setModal(true)
  }

  function abrirEditar(team) {
    setEditando(team)
    setForm({
      sport_id: team.sport_id,
      name: team.name,
      short_name: team.short_name ?? '',
      primary_color: team.primary_color ?? '#E84E1B',
      secondary_color: team.secondary_color ?? '#FFFFFF',
    })
    setLogoFile(null)
    setModal(true)
  }

  async function guardar() {
    if (!form.sport_id || !form.name) return
    const payload = { ...form, logoFile }
    if (editando) await editarEquipo.mutateAsync({ id: editando.id, ...payload })
    else await crearEquipo.mutateAsync(payload)
    setModal(false)
  }

  async function borrar(team) {
    if (!window.confirm(`Eliminar "${team.name}"?`)) return
    await borrarEquipo.mutateAsync(team.id)
  }

  const guardando = crearEquipo.isPending || editarEquipo.isPending

  return (
    <div className="px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-zinc-100">Equipos</h1>
        <Button size="sm" onClick={abrirCrear}>+ Nuevo Equipo</Button>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {[{ slug: '', name: 'Todos', icon: '👕' }, ...sports].map((sport) => (
          <button key={sport.slug} onClick={() => setFiltro(sport.slug)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap
              ${filtro === sport.slug ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-300'}`}>
            {sport.icon} {sport.name}
          </button>
        ))}
      </div>

      {isLoading ? <Spinner className="py-12" /> : equipos.length === 0 ? (
        <p className="text-center text-zinc-500 py-16 text-sm">No hay equipos todavia</p>
      ) : (
        <div className="space-y-3">
          {equipos.map((team) => (
            <div key={team.id} className="bg-surface-900 rounded-xl border border-surface-800 shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <TeamLogo
                    logoUrl={team.logo_url}
                    name={team.name}
                    color={team.primary_color}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{team.name}</p>
                    <p className="text-xs text-zinc-500">{team.sports?.icon} {team.sports?.name}</p>
                  </div>
                </div>
                <div className="flex gap-3 shrink-0">
                  <button onClick={() => abrirEditar(team)} className="text-xs text-primary font-medium">Editar</button>
                  <button onClick={() => borrar(team)} className="text-xs text-red-400 font-medium">Borrar</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editando ? 'Editar Equipo' : 'Nuevo Equipo'}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Deporte *</label>
            <select value={form.sport_id} onChange={(event) => setForm({ ...form, sport_id: event.target.value })}
              className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none">
              <option value="">Seleccionar...</option>
              {sports.map((sport) => <option key={sport.id} value={sport.id}>{sport.icon} {sport.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Nombre completo *</label>
            <input type="text" value={form.name} placeholder="Jorge Newbery FC"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Nombre corto</label>
            <input type="text" maxLength={12} value={form.short_name} placeholder="Newbery"
              onChange={(event) => setForm({ ...form, short_name: event.target.value })}
              className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[['primary_color', 'Color primario'], ['secondary_color', 'Color secundario']].map(([key, label]) => (
              <div key={key}>
                <label className="text-xs font-semibold text-zinc-400 mb-1 block">{label}</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form[key]}
                    onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                    className="w-10 h-10 rounded cursor-pointer border-0 p-0" />
                  <span className="text-xs text-zinc-500 font-mono">{form[key]}</span>
                </div>
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-400 mb-1 block">Logo</label>
            <input type="file" accept="image/*" onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
              className="w-full text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:bg-primary/10 file:text-primary file:text-xs file:font-medium" />
            {editando?.logo_url && !logoFile && (
              <img src={editando.logo_url} alt="Logo actual" className="mt-2 w-12 h-12 rounded-full object-cover" />
            )}
          </div>

          <Button onClick={guardar} disabled={guardando || !form.sport_id || !form.name} className="w-full">
            {guardando ? 'Guardando...' : editando ? 'Guardar equipo' : 'Crear Equipo'}
          </Button>

          {editando && <PlayersEditor teamId={editando.id} />}
        </div>
      </Modal>
    </div>
  )
}
