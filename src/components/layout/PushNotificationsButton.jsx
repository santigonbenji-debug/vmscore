import { useState } from 'react'
import BrandLogo from '../brand/BrandLogo'
import { usePushNotifications } from '../../hooks/usePushNotifications'
import { useFavorites } from '../../hooks/useFavorites'

export default function PushNotificationsButton() {
  const [open, setOpen] = useState(false)
  const { supported, enabled, loading, message, error, enableNotifications } = usePushNotifications()
  const { favorites } = useFavorites()

  if (!supported || enabled || favorites.length === 0) return null

  return (
    <div className="fixed bottom-36 left-0 right-0 z-40 mx-auto w-full max-w-lg px-3 pointer-events-none">
      <div className="pointer-events-auto rounded-xl border border-surface-700 bg-surface-900/95 p-3 shadow-2xl shadow-black/30 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black ring-1 ring-primary/40">
            <BrandLogo className="h-9 w-9" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-zinc-100">Alertas de partidos</p>
            <p className="text-xs text-zinc-500">Inicio, goles y finales de tus favoritos.</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              setOpen(true)
              await enableNotifications()
            }}
            disabled={loading}
            className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-primary-600 disabled:opacity-50"
          >
            {loading ? '...' : 'Activar'}
          </button>
        </div>
        {open && (message || error) && (
          <p className={`mt-2 border-t border-surface-800 pt-2 text-xs leading-relaxed ${error ? 'text-red-300' : 'text-emerald-300'}`}>
            {error || message}
          </p>
        )}
      </div>
    </div>
  )
}
