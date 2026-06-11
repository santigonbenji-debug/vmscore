import { useState } from 'react'
import { KeyRound, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { useLeagues } from '../../hooks/useLeagues'
import {
  useCreateMatchModerator,
  useMatchModerators,
  useSetMatchModeratorLeagues,
  useSetMatchModeratorStatus,
} from '../../hooks/useModerators'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'

const EMPTY_FORM = {
  displayName: '',
  leagueIds: [],
  email: '',
  password: '',
}

function generatePassword() {
  const bytes = new Uint32Array(4)
  window.crypto.getRandomValues(bytes)
  return `VM!${Array.from(bytes, (part) => part.toString(36)).join('-')}9m`
}

export default function ManageModerators() {
  const [modal, setModal] = useState(false)
  const [editLeaguesModal, setEditLeaguesModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingModerator, setEditingModerator] = useState(null)
  const [selectedLeagueIds, setSelectedLeagueIds] = useState([])
  const [createdAccess, setCreatedAccess] = useState(null)

  const { data: moderators = [], isLoading } = useMatchModerators()
  const { data: leagues = [] } = useLeagues({ approvalStatus: 'approved' })
  const createModerator = useCreateMatchModerator()
  const setStatus = useSetMatchModeratorStatus()
  const setLeagues = useSetMatchModeratorLeagues()

  function openCreate() {
    createModerator.reset()
    setCreatedAccess(null)
    setForm({ ...EMPTY_FORM, password: generatePassword() })
    setModal(true)
  }

  function toggleLeague(id, target = 'create') {
    if (target === 'edit') {
      setSelectedLeagueIds((current) => (
        current.includes(id) ? current.filter((leagueId) => leagueId !== id) : [...current, id]
      ))
      return
    }
    setForm((current) => ({
      ...current,
      leagueIds: current.leagueIds.includes(id)
        ? current.leagueIds.filter((leagueId) => leagueId !== id)
        : [...current.leagueIds, id],
    }))
  }

  async function createAccess() {
    if (!form.displayName || form.leagueIds.length === 0 || !form.email || form.password.length < 12) return
    const result = await createModerator.mutateAsync(form)
    setCreatedAccess(result)
  }

  async function toggleStatus(moderator) {
    const nextStatus = moderator.status === 'active' ? 'blocked' : 'active'
    const action = nextStatus === 'active' ? 'habilitar' : 'suspender'
    if (!window.confirm(`Confirmas ${action} el acceso de ${moderator.display_name || moderator.email}?`)) return
    await setStatus.mutateAsync({ userId: moderator.user_id, status: nextStatus })
  }

  function openEditLeagues(moderator) {
    setEditingModerator(moderator)
    setSelectedLeagueIds(moderator.league_ids ?? [])
    setEditLeaguesModal(true)
  }

  async function saveModeratorLeagues() {
    if (!editingModerator || selectedLeagueIds.length === 0) return
    await setLeagues.mutateAsync({
      userId: editingModerator.user_id,
      leagueIds: selectedLeagueIds,
    })
    setEditLeaguesModal(false)
    setEditingModerator(null)
  }

  return (
    <div className="px-4 py-6 pb-28">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Moderadores</h1>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Crea accesos operativos para una o varias ligas. Pueden editar partidos y publicar goles, sin ver importaciones ni sincronizaciones.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>+ Nuevo</Button>
      </div>

      <div className="mb-5 rounded-xl border border-primary/25 bg-primary/10 p-4">
        <div className="flex gap-3">
          <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-bold text-zinc-100">Permiso acotado a ligas elegidas</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              El moderador recibe solo los partidos publicados dentro de las competencias asignadas. No puede crear ligas, equipos ni acceder a fuentes externas.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? <Spinner className="py-12" /> : moderators.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">Todavia no creaste moderadores.</p>
      ) : (
        <div className="space-y-3">
          {moderators.map((moderator) => (
            <article key={moderator.user_id} className="rounded-xl border border-surface-800 bg-surface-900 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-zinc-100">{moderator.display_name || 'Moderador'}</p>
                  <p className="mt-1 truncate text-xs text-zinc-500">{moderator.email}</p>
                  <p className="mt-2 text-xs font-semibold text-primary">{moderator.league_names || 'Ligas sin asignar'}</p>
                </div>
                <Badge variant={moderator.status === 'active' ? 'success' : 'danger'}>
                  {moderator.status === 'active' ? 'Activo' : 'Suspendido'}
                </Badge>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openEditLeagues(moderator)}
                  disabled={moderator.status !== 'active'}
                >
                  Editar ligas
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggleStatus(moderator)}
                  disabled={setStatus.isPending}
                >
                  {moderator.status === 'active' ? 'Suspender acceso' : 'Habilitar acceso'}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Nuevo moderador"
        eyebrow="Acceso operativo"
        description="Elegi una o varias ligas. La cuenta quedara limitada a sus partidos publicados."
        icon={<KeyRound className="h-5 w-5" />}
        guide={[
          { title: 'Persona', text: 'Nombre y email de ingreso.' },
          { title: 'Ligas', text: 'Define el alcance permitido.' },
          { title: 'Trabajo', text: 'Partidos, goles y detalles.' },
        ]}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Nombre del moderador *</label>
            <input
              value={form.displayName}
              onChange={(event) => setForm({ ...form, displayName: event.target.value })}
              className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
              placeholder="Nombre y apellido"
              disabled={!!createdAccess}
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-zinc-400">Ligas asignadas *</label>
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-surface-700 bg-surface-950 p-2">
              {leagues.map((league) => (
                <label key={league.id} className="flex cursor-pointer items-center gap-3 rounded-lg bg-surface-900 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={form.leagueIds.includes(league.id)}
                    onChange={() => toggleLeague(league.id)}
                    disabled={!!createdAccess}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-zinc-100">{league.name}</span>
                    <span className="block truncate text-[11px] text-zinc-500">{league.organizations?.city || league.city}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              {form.leagueIds.length} liga{form.leagueIds.length === 1 ? '' : 's'} seleccionada{form.leagueIds.length === 1 ? '' : 's'}.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Email de acceso *</label>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
              placeholder="moderador@email.com"
              disabled={!!createdAccess}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <label className="block text-xs font-semibold text-zinc-400">Contrasena temporal *</label>
              {!createdAccess && (
                <button type="button" onClick={() => setForm({ ...form, password: generatePassword() })} className="text-xs font-bold text-primary">
                  Generar otra
                </button>
              )}
            </div>
            <input
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              className="w-full rounded-lg px-3 py-2.5 font-mono text-sm focus:outline-none"
              disabled={!!createdAccess}
            />
            <p className="mt-1 text-[11px] text-zinc-500">Compartila una sola vez. Despues puede cambiarla desde su panel.</p>
          </div>

          {createdAccess ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              Acceso creado para <strong>{createdAccess.email}</strong>. Ya puede ingresar y operar {createdAccess.leagues?.join(', ')}.
            </div>
          ) : (
            <Button
              onClick={createAccess}
              disabled={createModerator.isPending || !form.displayName || form.leagueIds.length === 0 || !form.email || form.password.length < 12}
              className="w-full"
            >
              {createModerator.isPending ? 'Creando acceso...' : 'Crear usuario y contrasena'}
            </Button>
          )}

          {createModerator.isError && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
              {createModerator.error?.message || 'No se pudo crear el acceso.'}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={editLeaguesModal}
        onClose={() => setEditLeaguesModal(false)}
        title="Editar ligas del moderador"
        eyebrow="Alcance"
        description="Elegi que competencias puede operar. Al guardar, pierde acceso a las que quites."
        icon={<SlidersHorizontal className="h-5 w-5" />}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-surface-700 bg-surface-800/60 p-3">
            <p className="text-sm font-black text-zinc-100">{editingModerator?.display_name || 'Moderador'}</p>
            <p className="mt-1 text-xs text-zinc-500">{editingModerator?.email}</p>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-surface-700 bg-surface-950 p-2">
            {leagues.map((league) => (
              <label key={league.id} className="flex cursor-pointer items-center gap-3 rounded-lg bg-surface-900 px-3 py-2">
                <input
                  type="checkbox"
                  checked={selectedLeagueIds.includes(league.id)}
                  onChange={() => toggleLeague(league.id, 'edit')}
                  className="h-4 w-4 accent-primary"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-zinc-100">{league.name}</span>
                  <span className="block truncate text-[11px] text-zinc-500">{league.organizations?.city || league.city}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-zinc-500">
            {selectedLeagueIds.length} liga{selectedLeagueIds.length === 1 ? '' : 's'} seleccionada{selectedLeagueIds.length === 1 ? '' : 's'}.
          </p>
          <Button
            onClick={saveModeratorLeagues}
            disabled={setLeagues.isPending || selectedLeagueIds.length === 0}
            className="w-full"
          >
            {setLeagues.isPending ? 'Guardando...' : 'Guardar ligas'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
