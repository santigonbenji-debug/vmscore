import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useTeamMatches } from '../../hooks/useAdminMatches'
import Spinner from '../../components/ui/Spinner'
import Badge   from '../../components/ui/Badge'
import Button  from '../../components/ui/Button'
import { formatFechaHora, labelStatus } from '../../lib/helpers'

const STATUS_VARIANT = {
  scheduled: 'default', in_progress: 'live',
  finished: 'success', postponed: 'warning', cancelled: 'danger',
}

export default function MisPartidos() {
  const { teamId } = useAuth()
  const { data: partidos = [], isLoading } = useTeamMatches(teamId)

  if (!teamId) return (
    <div className="px-4 py-8 text-center text-zinc-500">
      <p>Tu cuenta no tiene un equipo asignado.</p>
      <p className="text-sm mt-1">Contactá al administrador.</p>
    </div>
  )

  return (
    <div className="px-4 py-6">
      <h1 className="text-xl font-bold mb-5 text-zinc-100">Mis Partidos</h1>

      {isLoading && <Spinner className="py-12" />}

      {!isLoading && partidos.length === 0 && (
        <p className="text-center text-zinc-500 py-12 text-sm">
          No hay partidos programados todavía
        </p>
      )}

      <div className="space-y-3">
        {partidos.map((p) => {
          const soySocal     = p.home_team_id === teamId
          const rival        = soySocal
            ? (p.away_team_short_name ?? p.away_team_name)
            : (p.home_team_short_name ?? p.home_team_name)
          const condicion    = soySocal ? 'Local' : 'Visitante'
          const puedoCargar  = p.status !== 'cancelled'

          return (
            <div key={p.id} className="bg-surface-900 rounded-xl border border-surface-800 shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-500">
                  {formatFechaHora(p.scheduled_at)} · {condicion}
                </span>
                <Badge variant={STATUS_VARIANT[p.status] ?? 'default'}>
                  {labelStatus(p.status)}
                </Badge>
              </div>

              <div className="flex items-center justify-center gap-3 py-1 mb-3">
                <span className="font-bold text-sm">
                  {soySocal ? 'Mi equipo' : rival}
                </span>
                <span className="text-zinc-600 font-bold">
                  {p.status === 'finished'
                    ? `${p.home_score} - ${p.away_score}`
                    : 'vs'}
                </span>
                <span className="font-bold text-sm">
                  {soySocal ? rival : 'Mi equipo'}
                </span>
              </div>

              <p className="text-xs text-zinc-500 text-center mb-3">
                {p.league_name} · {p.phase_name}
              </p>

              {puedoCargar && (
                <Link to={`/admin/resultado/${p.id}`}>
                  <Button size="sm" variant={p.status === 'finished' ? 'outline' : 'primary'} className="w-full">
                    {p.status === 'finished' ? 'Ver / editar mis eventos' : 'Cargar eventos'}
                  </Button>
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
