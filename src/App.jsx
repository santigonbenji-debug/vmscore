import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Layout from './components/layout/Layout'
import Home        from './pages/Home'
import Fixture     from './pages/Fixture'
import Standings   from './pages/Standings'
import MatchDetail from './pages/MatchDetail'
import TeamProfile from './pages/TeamProfile'
import Favorites   from './pages/Favorites'
import Contacto    from './pages/Contacto'
import AdminLogin      from './pages/admin/AdminLogin'
import AdminDashboard  from './pages/admin/AdminDashboard'
import ManageLeagues   from './pages/admin/ManageLeagues'
import ManageTeams     from './pages/admin/ManageTeams'
import ManageMatches   from './pages/admin/ManageMatches'
import ManageReferees  from './pages/admin/ManageReferees'
import ManageVenues    from './pages/admin/ManageVenues'
import LoadResult      from './pages/admin/LoadResult'
import MisPartidos     from './pages/admin/MisPartidos'
import ManageSports    from './pages/admin/ManageSports'
import ManageRosters   from './pages/admin/ManageRosters'
import ManageNews      from './pages/admin/ManageNews'
import ManageStandings from './pages/admin/ManageStandings'
import ManageScorers   from './pages/admin/ManageScorers'

function ProtectedRoute({ children }) {
  const { isAdmin, loading } = useAuth()
  if (loading) return null
  if (!isAdmin) return <Navigate to="/admin/login" replace />
  return children
}

export default function App() {
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
      </Route>

      <Route path="/admin/login" element={<AdminLogin />} />

      <Route path="/admin" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index                     element={<AdminDashboard />} />
        <Route path="ligas"              element={<ManageLeagues />} />
        <Route path="equipos"            element={<ManageTeams />} />
        <Route path="partidos"           element={<ManageMatches />} />
        <Route path="arbitros"           element={<ManageReferees />} />
        <Route path="canchas"            element={<ManageVenues />} />
        <Route path="resultado/:matchId" element={<LoadResult />} />
        <Route path="mis-partidos"       element={<MisPartidos />} />
        <Route path="deportes"           element={<ManageSports />} />
        <Route path="planteles"          element={<ManageRosters />} />
        <Route path="noticias"           element={<ManageNews />} />
        <Route path="posiciones"         element={<ManageStandings />} />
        <Route path="goleadores"         element={<ManageScorers />} />
      </Route>
    </Routes>
  )
}
