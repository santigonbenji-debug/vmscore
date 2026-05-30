import { Outlet, useLocation } from 'react-router-dom'
import Navbar from './Navbar'
import BottomNav from './BottomNav'
import PwaInstallButton from './PwaInstallButton'
import PushNotificationsButton from './PushNotificationsButton'

export default function Layout() {
  const location = useLocation()
  const isAdmin = location.pathname.startsWith('/admin')
  const isCompetition = location.pathname.startsWith('/competencia/')
  const contentWidth = isCompetition ? 'max-w-6xl' : 'max-w-lg'

  return (
    <div className="min-h-screen bg-surface-950 text-zinc-100 flex flex-col">
      <Navbar />
      <main className={`flex-1 ${contentWidth} mx-auto w-full ${isAdmin ? 'pb-6' : 'pb-20'}`}>
        <Outlet />
      </main>

      {!isAdmin && (
        <>
          <div className="max-w-lg mx-auto w-full px-4 pb-24 pt-2">
            <a href="https://cafecito.app" target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-xs text-zinc-500 hover:text-primary transition-colors">
              Invitanos un cafecito para mantener VMScore
            </a>
          </div>
          <PushNotificationsButton />
          <PwaInstallButton />
          <BottomNav />
        </>
      )}
    </div>
  )
}
