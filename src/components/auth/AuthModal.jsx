import { useState } from 'react'
import { LogIn, Mail } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import Modal from '../ui/Modal'
import Button from '../ui/Button'

const INPUT = 'w-full rounded-lg border border-surface-700 bg-surface-800 px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-primary/30'

export default function AuthModal({ open, onClose, title = 'Entrar a VMScore', description = 'Crea tu cuenta para votar partidos y guardar tu perfil.' }) {
  const { signIn, signUp, signInWithGoogle } = useAuth()
  const [mode, setMode] = useState('login')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!email || password.length < 6) {
      setError('Completa email y una contrasena de al menos 6 caracteres.')
      return
    }

    setLoading(true)
    try {
      const result = mode === 'login'
        ? await signIn(email, password)
        : await signUp(email, password, { display_name: displayName })
      if (result.error) throw result.error
      if (mode === 'register' && !result.data?.session) {
        setMessage('Cuenta creada. Revisa tu email si Supabase pide confirmar el acceso.')
      } else {
        onClose()
      }
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesion.')
    } finally {
      setLoading(false)
    }
  }

  async function google() {
    setError('')
    setLoading(true)
    try {
      const { error: googleError } = await signInWithGoogle()
      if (googleError) throw googleError
    } catch (err) {
      setError(err.message || 'No se pudo continuar con Google.')
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      eyebrow="Cuenta VMScore"
      description={description}
      icon={<LogIn className="h-5 w-5" />}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 rounded-xl border border-surface-800 bg-surface-900 p-1">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`rounded-lg px-3 py-2 text-sm font-black ${mode === 'login' ? 'bg-primary text-white' : 'text-zinc-400'}`}
          >
            Ingresar
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`rounded-lg px-3 py-2 text-sm font-black ${mode === 'register' ? 'bg-primary text-white' : 'text-zinc-400'}`}
          >
            Crear cuenta
          </button>
        </div>

        <Button type="button" variant="outline" onClick={google} disabled={loading} className="w-full">
          Continuar con Google
        </Button>

        <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-zinc-600">
          <span className="h-px flex-1 bg-surface-800" />
          Email
          <span className="h-px flex-1 bg-surface-800" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-400">Nombre visible</label>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className={INPUT}
                placeholder="Tu nombre en VMScore"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={INPUT}
              placeholder="tu@email.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-400">Contrasena</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={INPUT}
              placeholder="Minimo 6 caracteres"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            <Mail className="h-4 w-4" />
            {loading ? 'Procesando...' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
          </Button>
        </form>

        {message && <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-200">{message}</p>}
        {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">{error}</p>}
      </div>
    </Modal>
  )
}
