import { useEffect, useMemo, useState } from 'react'
import BrandLogo from '../brand/BrandLogo'

function isIosDevice() {
  if (typeof window === 'undefined') return false
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

function isSafariBrowser() {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent.toLowerCase()
  return ua.includes('safari') && !ua.includes('crios') && !ua.includes('fxios')
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
  const isSafari = useMemo(() => isSafariBrowser(), [])

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
            {installPrompt ? 'Instalar' : 'Ver pasos'}
          </button>
        </div>
        {showHelp && (
          <div className="mt-3 border-t border-surface-800 pt-3 text-xs text-zinc-300">
            {isIos ? (
              <div className="space-y-2">
                <p className="font-bold text-zinc-100">Instalar en iPhone</p>
                {!isSafari && (
                  <p className="rounded-lg bg-amber-500/10 px-2 py-1.5 text-amber-200">
                    Abri esta pagina en Safari. iOS solo permite agregar PWAs desde Safari.
                  </p>
                )}
                <ol className="space-y-1.5 leading-relaxed">
                  <li><span className="font-bold text-primary">1.</span> Toca el boton Compartir de Safari.</li>
                  <li><span className="font-bold text-primary">2.</span> Baja en el menu y elegi Agregar a pantalla de inicio.</li>
                  <li><span className="font-bold text-primary">3.</span> Toca Agregar. VMScore aparecera como app.</li>
                </ol>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="font-bold text-zinc-100">Instalar en Android/Chrome</p>
                <ol className="space-y-1.5 leading-relaxed">
                  <li><span className="font-bold text-primary">1.</span> Toca el menu del navegador.</li>
                  <li><span className="font-bold text-primary">2.</span> Elegi Instalar app o Agregar a pantalla principal.</li>
                  <li><span className="font-bold text-primary">3.</span> Confirma la instalacion.</li>
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
