import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

function getAuthError() {
  const params = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return (
    params.get('error_description') ||
    params.get('error') ||
    hash.get('error_description') ||
    hash.get('error') ||
    ''
  )
}

export default function AdminResetPassword() {
  const navigate = useNavigate()
  const { updatePassword } = useAuth()
  const authError = useMemo(() => getAuthError(), [])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(authError)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 10) {
      setError('Usa una contrasena de al menos 10 caracteres.')
      return
    }

    if (password !== confirm) {
      setError('Las contrasenas no coinciden.')
      return
    }

    setLoading(true)
    const { error } = await updatePassword(password)
    setLoading(false)

    if (error) {
      setError(error.message ?? 'No se pudo actualizar la contrasena.')
      return
    }

    setDone(true)
    setTimeout(() => navigate('/admin/login'), 1800)
  }

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center px-4">
      <div className="bg-surface-900 rounded-2xl shadow-xl border border-surface-800 p-8 w-full max-w-sm">
        <h1 className="text-2xl font-extrabold text-primary mb-1">Nueva contrasena</h1>
        <p className="text-zinc-400 text-sm mb-6">Crea una clave segura para tu usuario admin.</p>

        {done ? (
          <div className="space-y-4">
            <p className="text-emerald-400 text-sm">Contrasena actualizada. Redirigiendo al login...</p>
            <Link to="/admin/login" className="block text-primary text-sm font-semibold hover:underline">
              Volver al login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              placeholder="Nueva contrasena"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg px-4 py-3 text-sm focus:outline-none"
              required
            />
            <input
              type="password"
              placeholder="Repetir contrasena"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg px-4 py-3 text-sm focus:outline-none"
              required
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || !!authError}
              className="w-full bg-primary hover:bg-primary-600 text-white rounded-lg py-3 font-semibold text-sm disabled:opacity-50 transition-colors"
            >
              {loading ? 'Guardando...' : 'Guardar contrasena'}
            </button>
            <Link to="/admin/login" className="block text-center text-zinc-400 hover:text-primary text-xs font-semibold">
              Volver al login
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
