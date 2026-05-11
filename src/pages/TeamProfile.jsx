import { useNavigate, useParams } from 'react-router-dom'
import FavoriteButton from '../components/teams/FavoriteButton'
import TeamLogo from '../components/teams/TeamLogo'
import Spinner from '../components/ui/Spinner'
import { useTeam } from '../hooks/useTeams'
import { useTeamMatches } from '../hooks/useMatches'
import { useTeamPlayers } from '../hooks/useRosters'
import { formatFechaLarga, formatHora, labelStatus } from '../lib/helpers'

const GENDERS = [
  { value: 'masculino', label: 'Masculino' },
  { value: 'femenino', label: 'Femenino' },
  { value: 'mixto', label: 'Mixto' },
]

function PlayerList({ title, players }) {
  return (
    <section className="rounded-xl border border-surface-800 bg-surface-900">
      <div className="flex items-center justify-between border-b border-surface-800 px-3 py-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-400">{title}</h2>
        <span className="text-xs font-semibold text-zinc-500">{players.length}</span>
      </div>
      {players.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-zinc-500">Sin jugadores cargados.</p>
      ) : (
        <div className="divide-y divide-surface-800">
          {players.map((player) => (
            <div key={player.id} className="flex items-center gap-3 px-3 py-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-800 text-xs font-bold text-zinc-300">
                {player.shirt_number ?? '-'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-100">{player.display_name}</p>
                <p className="truncate text-xs text-zinc-500">{player.position || 'Sin posicion'}</p>
              </div>
              {player.is_active === false && (
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-400">
                  Inactivo
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function MatchHistory({ teamId, matches, isLoading, onOpenMatch }) {
  if (isLoading) return <Spinner className="py-10" />

  return (
    <section className="rounded-xl border border-surface-800 bg-surface-900">
      <div className="flex items-center justify-between border-b border-surface-800 px-3 py-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-400">Historial de partidos</h2>
        <span className="text-xs font-semibold text-zinc-500">{matches.length}</span>
      </div>
      {matches.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-zinc-500">Todavia no hay partidos cargados.</p>
      ) : (
        <div className="divide-y divide-surface-800">
          {matches.map((match) => {
            const isHome = match.home_team_id === teamId
            const rivalName = isHome
              ? (match.away_team_short_name ?? match.away_team_name)
              : (match.home_team_short_name ?? match.home_team_name)
            const rivalLogo = isHome ? match.away_team_logo_url : match.home_team_logo_url
            const rivalColor = isHome ? match.away_primary_color : match.home_primary_color
            const finished = match.status === 'finished'
            const ownScore = isHome ? match.home_score : match.away_score
            const rivalScore = isHome ? match.away_score : match.home_score
            const result = finished && ownScore !== rivalScore
              ? ownScore > rivalScore ? 'G' : 'P'
              : finished ? 'E' : null

            return (
              <button
                key={match.id}
                onClick={() => onOpenMatch(match.id)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-800/60"
              >
                <TeamLogo logoUrl={rivalLogo} name={rivalName} color={rivalColor} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-100">
                    {isHome ? 'vs' : '@'} {rivalName}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    {match.league_name} · {match.scheduled_at ? `${formatFechaLarga(match.scheduled_at)} · ${formatHora(match.scheduled_at)}` : `Fecha ${match.round ?? '-'} · horario a definir`}
                  </p>
                </div>
                {finished ? (
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${
                      result === 'G'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : result === 'P'
                          ? 'bg-red-500/15 text-red-300'
                          : 'bg-zinc-700 text-zinc-300'
                    }`}>
                      {result}
                    </span>
                    <span className="text-sm font-extrabold tabular-nums text-zinc-100">
                      {ownScore} - {rivalScore}
                    </span>
                  </div>
                ) : (
                  <span className="rounded-full bg-surface-800 px-2 py-1 text-[10px] font-bold uppercase text-zinc-400">
                    {labelStatus(match.status)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default function TeamProfile() {
  const { teamId } = useParams()
  const navigate = useNavigate()
  const { data: team, isLoading: loadingTeam } = useTeam(teamId)
  const { data: players = [], isLoading: loadingPlayers } = useTeamPlayers(teamId)
  const { data: matches = [], isLoading: loadingMatches } = useTeamMatches(teamId)

  if (loadingTeam) return <Spinner className="py-16" />

  if (!team) {
    return (
      <div className="px-4 py-10 text-center text-sm text-zinc-500">
        Equipo no encontrado.
      </div>
    )
  }

  return (
    <div className="px-3 py-4 pb-28 space-y-4">
      <section className="rounded-xl border border-surface-800 bg-surface-900 p-4">
        <div className="flex items-start gap-4">
          <TeamLogo
            logoUrl={team.logo_url}
            name={team.name}
            color={team.primary_color}
            size="xl"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-extrabold text-zinc-100">{team.name}</h1>
                <p className="mt-1 text-sm text-zinc-500">
                  {team.sports?.icon} {team.sports?.name ?? 'Deporte'}{team.short_name ? ` · ${team.short_name}` : ''}
                </p>
              </div>
              <FavoriteButton teamId={team.id} className="-mt-1 shrink-0" />
            </div>
            {team.venues?.name && (
              <p className="mt-3 text-xs text-zinc-500">
                Cancha: <span className="font-semibold text-zinc-300">{team.venues.name}</span>
              </p>
            )}
          </div>
        </div>
      </section>

      {loadingPlayers ? (
        <Spinner className="py-10" />
      ) : (
        GENDERS.map((gender) => (
          <PlayerList
            key={gender.value}
            title={`Plantel ${gender.label}`}
            players={players.filter((player) => (player.gender ?? 'masculino') === gender.value)}
          />
        ))
      )}

      <MatchHistory
        teamId={team.id}
        matches={matches}
        isLoading={loadingMatches}
        onOpenMatch={(matchId) => navigate(`/partido/${matchId}`)}
      />
    </div>
  )
}
