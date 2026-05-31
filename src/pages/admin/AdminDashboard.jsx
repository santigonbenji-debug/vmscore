import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

const ACCESOS_SUPER = [
  { to: '/admin/organizaciones', label: 'Organizaciones', icon: 'O', desc: 'Ubicacion, archivo y permisos' },
  { to: '/admin/moderadores', label: 'Moderadores', icon: 'M', desc: 'Accesos limitados por liga' },
  { to: '/admin/ligas', label: 'Competiciones', icon: 'T', desc: 'Ligas, copas y torneos' },
  { to: '/admin/equipos', label: 'Equipos', icon: 'E', desc: 'Administrar clubes' },
  { to: '/admin/partidos', label: 'Partidos', icon: 'F', desc: 'Cargar fixture' },
  { to: '/admin/importar', label: 'Importar', icon: 'I', desc: 'Copa Facil y fuentes externas' },
  { to: '/admin/scraping', label: 'Scraping', icon: 'S', desc: 'Capturar torneos completos' },
  { to: '/admin/noticias', label: 'Noticias', icon: 'N', desc: 'Publicar novedades en Home' },
  { to: '/admin/arbitros', label: 'Arbitros', icon: 'A', desc: 'Listado de arbitros' },
  { to: '/admin/canchas', label: 'Canchas', icon: 'C', desc: 'Sedes y estadios' },
  { to: '/admin/deportes', label: 'Deportes', icon: 'D', desc: 'Agregar disciplinas' },
]

const ACCESOS_LIGA = [
  { to: '/admin/ligas', label: 'Competiciones', icon: 'T', desc: 'Ligas y copas para aprobacion' },
  { to: '/admin/deportes', label: 'Deportes', icon: 'D', desc: 'Disciplinas de la organizacion' },
  { to: '/admin/equipos', label: 'Equipos', icon: 'E', desc: 'Clubes, escudo, DT y plantel' },
  { to: '/admin/partidos', label: 'Partidos', icon: 'F', desc: 'Fixture, eventos y resultados' },
  { to: '/admin/canchas', label: 'Canchas', icon: 'C', desc: 'Sedes propias de la organizacion' },
]

const ACCESOS_CLUB = [
  { to: '/admin/equipos', label: 'Equipo', icon: 'E', desc: 'Plantel y datos del club' },
  { to: '/admin/mis-partidos', label: 'Mis Partidos', icon: 'M', desc: 'Cargar eventos de mi equipo' },
]

const ACCESOS_MODERADOR = [
  { to: '/admin/moderacion', label: 'Partidos de mi liga', icon: 'P', desc: 'Horarios, detalles, goles y resultados' },
]

export default function AdminDashboard() {
  const { user, isSuperAdmin, isOrganizationAdmin, isLigaAdmin, isClubAdmin, isMatchModerator, organization, signOut } = useAuth()

  const accesos = isSuperAdmin ? ACCESOS_SUPER
    : (isOrganizationAdmin || isLigaAdmin) ? ACCESOS_LIGA
    : isClubAdmin ? ACCESOS_CLUB
    : isMatchModerator ? ACCESOS_MODERADOR
    : []

  const labelRol = isSuperAdmin ? 'Super Admin'
    : isOrganizationAdmin ? 'Admin de Organizacion'
    : isLigaAdmin ? 'Admin de Liga'
    : isClubAdmin ? 'Admin de Club'
    : isMatchModerator ? 'Moderador de Partidos'
    : 'Sin rol'

  return (
    <div className="px-4 py-6 pb-28">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Panel Admin</h1>
          <p className="text-xs text-zinc-500">{user?.email}</p>
          {organization && <p className="text-xs text-zinc-500">{organization.city}, {organization.province}</p>}
          <span className="mt-1 inline-block rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
            {labelRol}
          </span>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link to="/admin/reset-password" className="text-xs font-medium text-zinc-400 hover:text-primary">
            Cambiar clave
          </Link>
          <button onClick={signOut} className="text-xs font-medium text-red-400 hover:text-red-300">
            Salir
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {accesos.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex flex-col items-start gap-1 rounded-xl border border-surface-800 bg-surface-900 p-4 shadow-sm transition-all hover:border-primary/40 active:scale-[0.98]"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-sm font-black text-primary">
              {item.icon}
            </span>
            <p className="text-sm font-semibold text-zinc-100">{item.label}</p>
            <p className="text-[11px] leading-snug text-zinc-500">{item.desc}</p>
          </Link>
        ))}
      </div>

      {!isSuperAdmin && (
        <div className="mt-8 rounded-xl border border-surface-800 bg-surface-800/50 p-4 text-center">
          <p className="text-xs text-zinc-400">
            Necesitas mas permisos? Contacta al administrador.
          </p>
        </div>
      )}
    </div>
  )
}
