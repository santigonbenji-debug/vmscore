import { useState } from 'react'

const SIZES = {
  xs: 'h-5 w-5 text-[8px]',
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-10 w-10 text-xs',
  lg: 'h-14 w-14 text-sm',
  xl: 'h-20 w-20 text-2xl',
}

export default function TeamLogo({
  logoUrl,
  name,
  color = '#E84E1B',
  size = 'sm',
  className = '',
}) {
  const [failed, setFailed] = useState(false)
  const sizeClass = SIZES[size] ?? SIZES.sm
  const initials = (name ?? '?').trim().slice(0, 2).toUpperCase()

  if (logoUrl && !failed) {
    return (
      <span
        className={`${sizeClass} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-surface-700 bg-white p-0.5 shadow-sm ${className}`}
      >
        <img
          src={logoUrl}
          alt={name ?? 'Equipo'}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full rounded-full object-contain"
        />
      </span>
    )
  }

  return (
    <span
      className={`${sizeClass} inline-flex shrink-0 items-center justify-center rounded-full border border-surface-700 font-extrabold text-white shadow-sm ${className}`}
      style={{ backgroundColor: color ?? '#E84E1B' }}
      aria-label={name ?? 'Equipo'}
    >
      {initials}
    </span>
  )
}
