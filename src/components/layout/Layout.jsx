import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import Navbar from './Navbar'
import BottomNav from './BottomNav'
import PwaInstallButton from './PwaInstallButton'
import PushNotificationsButton from './PushNotificationsButton'

function AdminQuickNav() {
  const navigate = useNavigate()

  return (
    <div className="px-3 pt-3">
      <div className="flex items-center justify-between gap-2 rounded-xl border border-surface-800 bg-surface-900/90 p-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-bold text-zinc-200 transition-colors hover:bg-surface-800"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Volver
        </button>
        <Link
          to="/admin"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-black text-white transition-colors hover:bg-primary-600"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-8 9 8" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 10v10h14V10" />
          </svg>
          Panel admin
        </Link>
      </div>
    </div>
  )
}

export default function Layout() {
  const location = useLocation()
  const isAdmin = location.pathname.startsWith('/admin')
  const showAdminQuickNav = isAdmin && location.pathname !== '/admin'
  const isCompetition = location.pathname.startsWith('/competencia/')
  const contentWidth = isCompetition ? 'max-w-6xl' : 'max-w-lg'

  return (
    <div className="min-h-screen bg-surface-950 text-zinc-100 flex flex-col">
      <Navbar />
      <main className={`flex-1 ${contentWidth} mx-auto w-full ${isAdmin ? 'pb-6' : 'pb-20'}`}>
        {showAdminQuickNav && <AdminQuickNav />}
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
