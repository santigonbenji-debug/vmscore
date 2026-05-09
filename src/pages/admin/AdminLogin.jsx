import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetting, setResetting] = useState(false)
  const { signIn, resetPassword } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    const { error } = await signIn(email, password)
    if (error) {
      setError('Email o contrasena incorrectos')
      setLoading(false)
      return
    }

    navigate('/admin')
  }

  async function handleResetPassword() {
    setError('')
    setMessage('')

    if (!email.trim()) {
      setError('Escribi tu email para enviar el recupero.')
      return
    }

    setResetting(true)
    const { error } = await resetPassword(email.trim())
    setResetting(false)

    if (error) {
      setError(error.message ?? 'No se pudo enviar el email de recuperacion.')
      return
    }

    setMessage('Te enviamos un email para cambiar la contrasena.')
  }

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center px-4">
      <div className="bg-surface-900 rounded-2xl shadow-xl border border-surface-800 p-8 w-full max-w-sm">
        <h1 className="text-2xl font-extrabold text-primary mb-1">VMScore</h1>
        <p className="text-zinc-400 text-sm mb-6">Panel de administracion</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg px-4 py-3 text-sm focus:outline-none"
            required
          />
          <input
            type="password"
            placeholder="Contrasena"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg px-4 py-3 text-sm focus:outline-none"
            required
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {message && <p className="text-emerald-400 text-sm">{message}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-600 text-white rounded-lg py-3 font-semibold text-sm disabled:opacity-50 transition-colors"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
          <button
            type="button"
            onClick={handleResetPassword}
            disabled={resetting}
            className="w-full text-zinc-400 hover:text-primary text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {resetting ? 'Enviando...' : 'Olvide mi contrasena'}
          </button>
        </form>
      </div>
    </div>
  )
}
