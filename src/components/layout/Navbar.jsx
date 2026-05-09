import { Link } from 'react-router-dom'

export default function Navbar() {
  return (
    <header className="bg-surface-950/95 backdrop-blur border-b border-surface-800 sticky top-0 z-50">
      <div className="max-w-lg mx-auto px-4 h-12 flex items-center justify-between">
        <Link to="/">
          <span className="text-primary font-extrabold text-lg tracking-tight">VMScore</span>
        </Link>
        <Link to="/contacto"
          className="text-xs text-white bg-primary font-semibold px-3 py-1.5 rounded-full transition-colors hover:bg-primary-600">
          ¿Tenés un club? 🏆
        </Link>
      </div>
    </header>
  )
}
