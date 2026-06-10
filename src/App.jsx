import { Routes, Route, Navigate } from 'react-router-dom'
import { ArchiveX, LogOut } from 'lucide-react'
import { useAuth } from './hooks/useAuth'
import { useRealtimeInvalidation } from './hooks/useRealtimeInvalidation'
import Layout from './components/layout/Layout'
import Home        from './pages/Home'
import Fixture     from './pages/Fixture'
import Standings   from './pages/Standings'
import MatchDetail from './pages/MatchDetail'
import TeamProfile from './pages/TeamProfile'
import Favorites   from './pages/Favorites'
import Contacto    from './pages/Contacto'
import CompetitionDetail from './pages/CompetitionDetail'
import AdminLogin      from './pages/admin/AdminLogin'
import AdminResetPassword from './pages/admin/AdminResetPassword'
import AdminDashboard  from './pages/admin/AdminDashboard'
import ManageLeagues   from './pages/admin/ManageLeagues'
import ManageTeams     from './pages/admin/ManageTeams'
import ManageMatches   from './pages/admin/ManageMatches'
import ManageReferees  from './pages/admin/ManageReferees'
import ManageVenues    from './pages/admin/ManageVenues'
import LoadResult      from './pages/admin/LoadResult'
import MisPartidos     from './pages/admin/MisPartidos'
import ManageSports    from './pages/admin/ManageSports'
import ManageNews      from './pages/admin/ManageNews'
import ManageStandings from './pages/admin/ManageStandings'
import ManageScorers   from './pages/admin/ManageScorers'
import ManageExternalSources from './pages/admin/ManageExternalSources'
import ManageDeepScraping from './pages/admin/ManageDeepScraping'
import ManageOrganizations from './pages/admin/ManageOrganizations'
import ManageCompetition from './pages/admin/ManageCompetition'
import ManageModerators from './pages/admin/ManageModerators'
import ModeratorMatches from './pages/admin/ModeratorMatches'

function OrganizationAccessNotice() {
  const { organization, signOut } = useAuth()
  const isBlocked = organization?.status === 'blocked'
  const title = isBlocked ? 'Tu organizacion fue bloqueada' : 'Tu organizacion fue archivada'
  const reason = organization?.archive_reason?.trim() || 'Sin motivo especificado.'

  return (
    <div className="min-h-screen bg-black px-4 py-8 text-zinc-100">
      <div className="mx-auto flex min-h-[70vh] max-w-lg items-center">
        <section className="w-full rounded-2xl border border-primary/20 bg-surface-900 p-5 shadow-2xl shadow-black/40">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ArchiveX className="h-6 w-6" />
          </div>
          <p className="text-xs font-black uppercase tracking-wide text-primary">
            Acceso detenido
          </p>
          <h1 className="mt-2 text-2xl font-black text-white">{title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            {organization?.name ? `${organization.name} no esta disponible en este momento.` : 'Esta organizacion no esta disponible en este momento.'}
          </p>

          <div className="mt-5 rounded-xl border border-surface-700 bg-surface-950 p-4">
            <p className="text-[11px] font-black uppercase tracking-wide text-zinc-500">Motivo</p>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-zinc-100">{reason}</p>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-zinc-400">
            Contacta al administrador de VMScore para revisar la situacion o solicitar la reactivacion.
          </p>

          <button
            type="button"
            onClick={signOut}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-surface-800 px-4 py-3 text-sm font-black text-zinc-100 transition hover:bg-surface-700"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesion
          </button>
        </section>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { isAdmin, isSuperAdmin, loading, organization } = useAuth()
  if (loading) return null
  if (!isAdmin) return <Navigate to="/admin/login" replace />
  if (!isSuperAdmin && ['archived', 'blocked'].includes(organization?.status)) {
    return <OrganizationAccessNotice />
  }
  return children
}

function SuperAdminRoute({ children }) {
  const { isSuperAdmin, loading } = useAuth()
  if (loading) return null
  if (!isSuperAdmin) return <Navigate to="/admin" replace />
  return children
}

function NonModeratorRoute({ children }) {
  const { isMatchModerator, loading } = useAuth()
  if (loading) return null
  if (isMatchModerator) return <Navigate to="/admin/moderacion" replace />
  return children
}

function ModeratorRoute({ children }) {
  const { isSuperAdmin, isMatchModerator, loading } = useAuth()
  if (loading) return null
  if (!isSuperAdmin && !isMatchModerator) return <Navigate to="/admin" replace />
  return children
}

export default function App() {
  useRealtimeInvalidation()

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="fixture"          element={<Fixture />} />
        <Route path="posiciones"       element={<Standings />} />
        <Route path="partido/:matchId" element={<MatchDetail />} />
        <Route path="equipo/:teamId"   element={<TeamProfile />} />
        <Route path="favoritos"        element={<Favorites />} />
        <Route path="contacto"         element={<Contacto />} />
        <Route path="competencia/:leagueId" element={<CompetitionDetail />} />
      </Route>

      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/reset-password" element={<AdminResetPassword />} />

      <Route path="/admin" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index                     element={<AdminDashboard />} />
        <Route path="ligas"              element={<NonModeratorRoute><ManageLeagues /></NonModeratorRoute>} />
        <Route path="competencia/:leagueId" element={<NonModeratorRoute><ManageCompetition /></NonModeratorRoute>} />
        <Route path="equipos"            element={<NonModeratorRoute><ManageTeams /></NonModeratorRoute>} />
        <Route path="partidos"           element={<NonModeratorRoute><ManageMatches /></NonModeratorRoute>} />
        <Route path="arbitros"           element={<NonModeratorRoute><ManageReferees /></NonModeratorRoute>} />
        <Route path="canchas"            element={<NonModeratorRoute><ManageVenues /></NonModeratorRoute>} />
        <Route path="resultado/:matchId" element={<LoadResult />} />
        <Route path="mis-partidos"       element={<NonModeratorRoute><MisPartidos /></NonModeratorRoute>} />
        <Route path="deportes"           element={<NonModeratorRoute><ManageSports /></NonModeratorRoute>} />
        <Route path="organizaciones"     element={<SuperAdminRoute><ManageOrganizations /></SuperAdminRoute>} />
        <Route path="moderadores"        element={<SuperAdminRoute><ManageModerators /></SuperAdminRoute>} />
        <Route path="moderacion"         element={<ModeratorRoute><ModeratorMatches /></ModeratorRoute>} />
        <Route path="planteles"          element={<Navigate to="/admin/equipos" replace />} />
        <Route path="noticias"           element={<SuperAdminRoute><ManageNews /></SuperAdminRoute>} />
        <Route path="posiciones"         element={<NonModeratorRoute><ManageStandings /></NonModeratorRoute>} />
        <Route path="goleadores"         element={<SuperAdminRoute><ManageScorers /></SuperAdminRoute>} />
        <Route path="importar"           element={<SuperAdminRoute><ManageExternalSources /></SuperAdminRoute>} />
        <Route path="scraping"           element={<SuperAdminRoute><ManageDeepScraping /></SuperAdminRoute>} />
      </Route>
    </Routes>
  )
}
