export default function Button({ children, variant = 'primary', size = 'md', className = '', ...props }) {
  const v = {
    primary:   'bg-primary text-white hover:bg-primary-600',
    secondary: 'bg-surface-800 text-zinc-100 hover:bg-surface-700',
    outline:   'border border-primary text-primary hover:bg-primary/10',
    ghost:     'text-zinc-300 hover:bg-surface-800',
    danger:    'bg-red-600 text-white hover:bg-red-700',
  }
  const s = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' }
  return (
    <button className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${v[variant]} ${s[size]} ${className}`} {...props}>
      {children}
    </button>
  )
}
