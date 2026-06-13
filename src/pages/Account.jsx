import { useEffect, useMemo, useState } from 'react'
import { UserRound } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useTeams } from '../hooks/useTeams'
import { useSaveUserProfile, useUserProfile } from '../hooks/useUserProfile'
import AuthModal from '../components/auth/AuthModal'
import TeamLogo from '../components/teams/TeamLogo'
import Button from '../components/ui/Button'
import Spinner from '../components/ui/Spinner'

const INPUT = 'w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30'

function AvatarPreview({ name, team }) {
  return (
    <div className="rounded-2xl border border-surface-800 bg-surface-900 p-4">
      <div className="flex items-center gap-4">
        <div className="relative grid h-20 w-20 shrink-0 place-items-center rounded-3xl border border-primary/25 bg-gradient-to-b from-primary/25 to-surface-950 shadow-[0_0_30px_rgba(232,78,27,0.12)]">
          <div className="absolute top-3 h-8 w-8 rounded-full bg-zinc-200" />
          <div
            className="absolute bottom-3 h-9 w-12 rounded-t-2xl border border-white/10"
            style={{ backgroundColor: team?.primary_color || '#e84e1b' }}
          />
          <div className="absolute bottom-1 h-3 w-14 rounded-full bg-black/40 blur-sm" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-primary">Avatar VMScore</p>
          <h2 className="mt-1 truncate text-xl font-black text-zinc-100">{name || 'Tu nombre'}</h2>
          <div className="mt-2 flex items-center gap-2">
            {team ? <TeamLogo logoUrl={team.logo_url} name={team.name} color={team.primary_color} /> : null}
            <p className="truncate text-sm font-semibold text-zinc-400">{team?.short_name || team?.name || 'Sin equipo favorito'}</p>
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
        Esta es la primera version del perfil. Despues podemos convertirlo en un avatar mas personalizable.
      </p>
    </div>
  )
}

export default function Account() {
  const { user, loading, signOut, updatePassword } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [favoriteTeamId, setFavoriteTeamId] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const { data: profile, isLoading: loadingProfile } = useUserProfile(user?.id)
  const { data: teams = [] } = useTeams()
  const saveProfile = useSaveUserProfile()

  useEffect(() => {
    if (!profile && user) {
      setDisplayName(user.user_metadata?.display_name || user.email?.split('@')[0] || '')
      setFavoriteTeamId('')
      return
    }
    setDisplayName(profile?.display_name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || '')
    setFavoriteTeamId(profile?.favorite_team_id || '')
  }, [profile, user])

  const selectedTeam = useMemo(() => teams.find((team) => team.id === favoriteTeamId) ?? profile?.favorite_team ?? null, [favoriteTeamId, profile, teams])

  async function save() {
    setError('')
    setMessage('')
    try {
      await saveProfile.mutateAsync({
        userId: user.id,
        displayName,
        favoriteTeamId,
        avatarStyle: profile?.avatar_style ?? {},
      })
      setMessage('Perfil guardado.')
    } catch (err) {
      setError(err.message || 'No se pudo guardar el perfil.')
    }
  }

  async function changePassword() {
    setError('')
    setMessage('')
    if (password.length < 6) {
      setError('La contrasena debe tener al menos 6 caracteres.')
      return
    }
    const { error: passwordError } = await updatePassword(password)
    if (passwordError) {
      setError(passwordError.message)
      return
    }
    setPassword('')
    setMessage('Contrasena actualizada.')
  }

  if (loading) return <Spinner className="py-20" />

  if (!user) {
    return (
      <div className="px-4 py-8 pb-28">
        <section className="rounded-2xl border border-surface-800 bg-surface-900 p-5">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary">
            <UserRound className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-black text-zinc-100">Tu cuenta VMScore</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Inicia sesion para votar partidos, elegir tu equipo y guardar tu perfil.
          </p>
          <Button className="mt-5 w-full" onClick={() => setAuthOpen(true)}>Ingresar o crear cuenta</Button>
        </section>
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      </div>
    )
  }

  if (loadingProfile) return <Spinner className="py-20" />

  return (
    <div className="space-y-4 px-4 py-6 pb-28">
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-primary">Cuenta</p>
        <h1 className="mt-1 text-2xl font-black text-zinc-100">Mi perfil</h1>
        <p className="mt-1 text-sm text-zinc-500">{user.email}</p>
      </div>

      <AvatarPreview name={displayName} team={selectedTeam} />

      <section className="rounded-2xl border border-surface-800 bg-surface-900 p-4">
        <h2 className="text-sm font-black text-zinc-100">Datos publicos</h2>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Nombre visible</label>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={INPUT} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Equipo favorito</label>
            <select value={favoriteTeamId} onChange={(event) => setFavoriteTeamId(event.target.value)} className={INPUT}>
              <option value="">Sin equipo</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </div>
          <Button onClick={save} disabled={saveProfile.isPending} className="w-full">
            {saveProfile.isPending ? 'Guardando...' : 'Guardar perfil'}
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-surface-800 bg-surface-900 p-4">
        <h2 className="text-sm font-black text-zinc-100">Seguridad</h2>
        <div className="mt-4 space-y-3">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={INPUT}
            placeholder="Nueva contrasena"
          />
          <Button variant="outline" onClick={changePassword} className="w-full">Cambiar contrasena</Button>
        </div>
      </section>

      {message && <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</p>}
      {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

      <Button variant="secondary" onClick={signOut} className="w-full">Cerrar sesion</Button>
    </div>
  )
}
