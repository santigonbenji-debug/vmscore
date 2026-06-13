import { Link } from 'react-router-dom'
import { Trophy, UserRound } from 'lucide-react'
import BrandLogo from '../brand/BrandLogo'
import { useAuth } from '../../hooks/useAuth'

export default function Navbar() {
  const { user } = useAuth()

  return (
    <header className="sticky top-0 z-50 border-b border-surface-800 bg-surface-950/95 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-lg items-center justify-between px-4">
        <Link to="/">
          <BrandLogo className="h-9 w-9" showText />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            to="/contacto"
            className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-600"
          >
            Tenes un club?
            <Trophy className="h-3.5 w-3.5" />
          </Link>
          <Link
            to="/cuenta"
            className={`grid h-9 w-9 place-items-center rounded-full border transition-colors ${
              user ? 'border-primary/40 bg-primary/15 text-primary' : 'border-surface-700 bg-surface-900 text-zinc-400'
            }`}
            aria-label="Cuenta VMScore"
          >
            <UserRound className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  )
}
