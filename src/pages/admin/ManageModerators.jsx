import { useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { useLeagues } from '../../hooks/useLeagues'
import { useCreateMatchModerator, useMatchModerators, useSetMatchModeratorStatus } from '../../hooks/useModerators'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'

const EMPTY_FORM = {
  displayName: '',
  leagueId: '',
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
  const [form, setForm] = useState(EMPTY_FORM)
  const [createdAccess, setCreatedAccess] = useState(null)
  const { data: moderators = [], isLoading } = useMatchModerators()
  const { data: leagues = [] } = useLeagues({ approvalStatus: 'approved' })
  const createModerator = useCreateMatchModerator()
  const setStatus = useSetMatchModeratorStatus()

  function openCreate() {
    createModerator.reset()
    setCreatedAccess(null)
    setForm({ ...EMPTY_FORM, password: generatePassword() })
    setModal(true)
  }

  async function createAccess() {
    if (!form.displayName || !form.leagueId || !form.email || form.password.length < 12) return
    const result = await createModerator.mutateAsync(form)
    setCreatedAccess(result)
  }

  async function toggleStatus(moderator) {
    const nextStatus = moderator.status === 'active' ? 'blocked' : 'active'
    const action = nextStatus === 'active' ? 'habilitar' : 'bloquear'
    if (!window.confirm(`Confirmas ${action} el acceso de ${moderator.display_name || moderator.email}?`)) return
    await setStatus.mutateAsync({ userId: moderator.user_id, status: nextStatus })
  }

  return (
    <div className="px-4 py-6 pb-28">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Moderadores</h1>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Crea accesos operativos por liga. Pueden editar partidos y publicar goles, sin ver importaciones ni sincronizaciones.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>+ Nuevo</Button>
      </div>

      <div className="mb-5 rounded-xl border border-primary/25 bg-primary/10 p-4">
        <div className="flex gap-3">
          <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-bold text-zinc-100">Permiso acotado a una liga</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              El moderador recibe los partidos que vos publiques dentro de esa competencia. No puede crear ligas, equipos ni acceder a fuentes externas.
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
                  <p className="mt-2 text-xs font-semibold text-primary">{moderator.league_name || 'Liga sin asignar'}</p>
                </div>
                <Badge variant={moderator.status === 'active' ? 'success' : 'danger'}>
                  {moderator.status === 'active' ? 'Activo' : 'Bloqueado'}
                </Badge>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-4 w-full"
                onClick={() => toggleStatus(moderator)}
                disabled={setStatus.isPending}
              >
                {moderator.status === 'active' ? 'Bloquear acceso' : 'Habilitar acceso'}
              </Button>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Nuevo moderador"
        eyebrow="Acceso operativo"
        description="Elegí una liga. La cuenta quedará limitada a sus partidos publicados."
        icon={<KeyRound className="h-5 w-5" />}
        guide={[
          { title: 'Persona', text: 'Nombre y email de ingreso.' },
          { title: 'Liga', text: 'Define el único alcance permitido.' },
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
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Liga asignada *</label>
            <select
              value={form.leagueId}
              onChange={(event) => setForm({ ...form, leagueId: event.target.value })}
              className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none"
              disabled={!!createdAccess}
            >
              <option value="">Seleccionar liga...</option>
              {leagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name} - {league.organizations?.city || league.city}
                </option>
              ))}
            </select>
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
              <label className="block text-xs font-semibold text-zinc-400">Contraseña temporal *</label>
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
            <p className="mt-1 text-[11px] text-zinc-500">Compartila una sola vez. Después puede cambiarla desde su panel.</p>
          </div>

          {createdAccess ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              Acceso creado para <strong>{createdAccess.email}</strong>. Ya puede ingresar y operar {createdAccess.league}.
            </div>
          ) : (
            <Button
              onClick={createAccess}
              disabled={createModerator.isPending || !form.displayName || !form.leagueId || !form.email || form.password.length < 12}
              className="w-full"
            >
              {createModerator.isPending ? 'Creando acceso...' : 'Crear usuario y contraseña'}
            </Button>
          )}

          {createModerator.isError && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
              {createModerator.error?.message || 'No se pudo crear el acceso.'}
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
