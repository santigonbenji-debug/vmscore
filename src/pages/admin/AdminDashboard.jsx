import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

const ACCESOS_SUPER = [
  { to: '/admin/ligas',     label: 'Ligas',      icon: '🏆', desc: 'Crear y editar torneos' },
  { to: '/admin/equipos',   label: 'Equipos',    icon: '👕', desc: 'Administrar clubes' },
  { to: '/admin/planteles', label: 'Planteles',  icon: '👥', desc: 'Jugadores y cuerpo técnico' },
  { to: '/admin/partidos',  label: 'Partidos',   icon: '📅', desc: 'Cargar fixture' },
  { to: '/admin/noticias',  label: 'Noticias',   icon: '📰', desc: 'Publicar novedades en Home' },
  { to: '/admin/arbitros',  label: 'Árbitros',   icon: '🟨', desc: 'Listado de árbitros' },
  { to: '/admin/canchas',   label: 'Canchas',    icon: '🏟️', desc: 'Sedes y estadios' },
  { to: '/admin/deportes',  label: 'Deportes',   icon: '🏅', desc: 'Agregar disciplinas' },
]

const ACCESOS_LIGA = [
  { to: '/admin/planteles', label: 'Planteles', icon: '👥', desc: 'Equipos y jugadores de la liga' },
  { to: '/admin/partidos',  label: 'Partidos',  icon: '📅', desc: 'Ver y gestionar fixture' },
  { to: '/admin/noticias',  label: 'Noticias',  icon: '📰', desc: 'Publicar novedades' },
]

const ACCESOS_CLUB = [
  { to: '/admin/planteles',    label: 'Plantel',      icon: '👥', desc: 'Administrar jugadores del equipo' },
  { to: '/admin/mis-partidos', label: 'Mis Partidos', icon: '⚽', desc: 'Cargar eventos de mi equipo' },
]

export default function AdminDashboard() {
  const { user, isSuperAdmin, isLigaAdmin, isClubAdmin, signOut } = useAuth()

  const accesos = isSuperAdmin ? ACCESOS_SUPER
    : isLigaAdmin ? ACCESOS_LIGA
    : isClubAdmin ? ACCESOS_CLUB
    : []

  const labelRol = isSuperAdmin ? 'Super Admin'
    : isLigaAdmin ? 'Admin de Liga'
    : isClubAdmin ? 'Admin de Club'
    : 'Sin rol'

  return (
    <div className="px-4 py-6 pb-28">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Panel Admin</h1>
          <p className="text-xs text-zinc-500">{user?.email}</p>
          <span className="inline-block mt-1 text-xs bg-primary/15 border border-primary/30 text-primary font-semibold px-2 py-0.5 rounded-full">
            {labelRol}
          </span>
        </div>
        <button onClick={signOut} className="text-xs text-red-400 font-medium hover:text-red-300">
          Salir
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {accesos.map((item) => (
          <Link key={item.to} to={item.to}
            className="flex flex-col items-start gap-1 bg-surface-900 rounded-xl p-4 border border-surface-800 shadow-sm hover:border-primary/40 active:scale-[0.98] transition-all">
            <span className="text-2xl">{item.icon}</span>
            <p className="font-semibold text-sm text-zinc-100">{item.label}</p>
            <p className="text-[11px] text-zinc-500 leading-snug">{item.desc}</p>
          </Link>
        ))}
      </div>

      {!isSuperAdmin && (
        <div className="mt-8 bg-surface-800/50 border border-surface-800 rounded-xl p-4 text-center">
          <p className="text-xs text-zinc-400">
            ¿Necesitás más permisos? Contactá al administrador.
          </p>
        </div>
      )}
    </div>
  )
}
