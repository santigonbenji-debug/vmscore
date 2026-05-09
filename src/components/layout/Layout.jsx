import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import BottomNav from './BottomNav'

export default function Layout() {
  return (
    <div className="min-h-screen bg-surface-950 text-zinc-100 flex flex-col">
      <Navbar />
      {/* SLOT_AD_BANNER — reservado para monetización futura */}
      <main className="flex-1 pb-20 max-w-lg mx-auto w-full">
        <Outlet />
      </main>
      {/* Footer con Cafecito — monetización */}
      <div className="max-w-lg mx-auto w-full px-4 pb-24 pt-2">
        <a href="https://cafecito.app" target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 text-xs text-zinc-500 hover:text-primary transition-colors">
          ☕ Invitanos un cafecito para mantener VMScore
        </a>
      </div>
      <BottomNav />
    </div>
  )
}
