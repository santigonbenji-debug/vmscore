export default function Badge({ children, variant = 'default', className = '' }) {
  const v = {
    default: 'bg-surface-800 text-zinc-300',
    primary: 'bg-primary/15 text-primary',
    success: 'bg-emerald-500/15 text-emerald-400',
    warning: 'bg-amber-500/15 text-amber-400',
    danger:  'bg-red-500/15 text-red-400',
    live:    'bg-emerald-500 text-white animate-pulse',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${v[variant]} ${className}`}>
      {children}
    </span>
  )
}
