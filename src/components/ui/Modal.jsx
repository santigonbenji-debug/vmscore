import { useEffect } from 'react'
import { X } from 'lucide-react'

const SIZE = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

export default function Modal({
  open,
  onClose,
  title,
  description,
  eyebrow,
  icon,
  guide = [],
  size = 'md',
  children,
}) {
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handler)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handler)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${SIZE[size] ?? SIZE.md} max-h-[92dvh] overflow-hidden rounded-t-2xl border border-surface-800 bg-surface-950 text-zinc-100 shadow-2xl sm:rounded-2xl`}>
        <div className="sticky top-0 z-10 border-b border-surface-800 bg-surface-950/95 px-5 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-3">
              {icon && (
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-primary/25 bg-primary/15 text-primary shadow-[0_0_24px_rgba(232,78,27,0.16)]">
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                {eyebrow && <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">{eyebrow}</p>}
                <h2 className="text-lg font-black leading-tight text-zinc-50">{title}</h2>
                {description && <p className="mt-1 text-sm leading-snug text-zinc-400">{description}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-800 text-zinc-400 transition-colors hover:bg-surface-700 hover:text-white"
              aria-label="Cerrar modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {guide.length > 0 && (
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {guide.map((item, index) => (
                <div key={`${item.title}-${index}`} className="rounded-xl border border-surface-800 bg-surface-900 p-3">
                  <p className="text-[10px] font-black uppercase tracking-wide text-primary">{String(index + 1).padStart(2, '0')}</p>
                  <p className="mt-1 text-xs font-bold text-zinc-100">{item.title}</p>
                  {item.text && <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{item.text}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="max-h-[calc(92dvh-5rem)] overflow-y-auto px-5 py-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  )
}
