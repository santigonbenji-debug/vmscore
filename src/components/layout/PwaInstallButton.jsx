import { useEffect, useMemo, useState } from 'react'
import BrandLogo from '../brand/BrandLogo'

function isIosDevice() {
  if (typeof window === 'undefined') return false
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export default function PwaInstallButton() {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [showHelp, setShowHelp] = useState(false)
  const [installed, setInstalled] = useState(() => isStandalone())
  const isIos = useMemo(() => isIosDevice(), [])

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault()
      setInstallPrompt(event)
    }

    function handleInstalled() {
      setInstalled(true)
      setInstallPrompt(null)
      setShowHelp(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  if (installed) return null

  async function install() {
    if (!installPrompt) {
      setShowHelp((value) => !value)
      return
    }

    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') {
      setInstalled(true)
    }
    setInstallPrompt(null)
  }

  return (
    <div className="fixed bottom-20 left-0 right-0 z-40 mx-auto w-full max-w-lg px-3 pointer-events-none">
      <div className="pointer-events-auto rounded-xl border border-primary/40 bg-surface-900/95 p-3 shadow-2xl shadow-black/30 backdrop-blur">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-10 w-10" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-zinc-100">Instalar VMScore</p>
            <p className="text-xs text-zinc-500">Acceso rapido y modo offline desde el celular.</p>
          </div>
          <button
            type="button"
            onClick={install}
            className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-primary-600"
          >
            Instalar
          </button>
        </div>
        {showHelp && (
          <p className="mt-2 border-t border-surface-800 pt-2 text-xs leading-relaxed text-zinc-400">
            {isIos
              ? 'En iPhone: toca Compartir y despues Agregar a pantalla de inicio.'
              : 'En Android/Chrome: toca el menu del navegador y elegi Instalar app o Agregar a pantalla principal.'}
          </p>
        )}
      </div>
    </div>
  )
}
