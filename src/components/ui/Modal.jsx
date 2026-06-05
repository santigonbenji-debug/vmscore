import { useEffect } from 'react'
import { X } from 'lucide-react'

const SIZE = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
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
  contentClassName = '',
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
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className={`relative flex max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden rounded-t-2xl border border-surface-800 bg-surface-950 text-zinc-100 shadow-2xl sm:max-h-[92dvh] sm:rounded-2xl ${SIZE[size] ?? SIZE.md}`}>
        <div className="shrink-0 border-b border-surface-800 bg-surface-950/95 px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur sm:px-5 sm:py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-3">
              {icon && (
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-primary/25 bg-primary/15 text-primary shadow-[0_0_24px_rgba(232,78,27,0.16)] sm:h-11 sm:w-11">
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
            <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0">
              {guide.map((item, index) => (
                <div key={`${item.title}-${index}`} className="min-w-36 rounded-xl border border-surface-800 bg-surface-900 p-2.5 sm:min-w-0 sm:p-3">
                  <p className="text-[10px] font-black uppercase tracking-wide text-primary">{String(index + 1).padStart(2, '0')}</p>
                  <p className="mt-1 text-xs font-bold text-zinc-100">{item.title}</p>
                  {item.text && <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{item.text}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(8.5rem+env(safe-area-inset-bottom))] sm:px-5 sm:pb-6 ${contentClassName}`}>
          {children}
        </div>
      </div>
    </div>
  )
}
