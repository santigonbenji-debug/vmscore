import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, ChevronLeft, GitBranch, Table2, Trophy } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toZonedTime } from 'date-fns-tz'
import { useLeague, usePhases } from '../hooks/useLeagues'
import { useLeagueMatches } from '../hooks/useMatches'
import { useFavorites } from '../hooks/useFavorites'
import TeamLogo from '../components/teams/TeamLogo'
import Badge from '../components/ui/Badge'
import Spinner from '../components/ui/Spinner'
import { matchStatusDetail } from '../lib/helpers'

const TZ = 'America/Argentina/San_Luis'

const TYPE_LABEL = {
  liga: 'Liga',
  copa: 'Copa',
  torneo: 'Torneo',
  campeonato: 'Campeonato',
}

const FORMAT_LABEL = {
  round_robin: 'Todos contra todos',
  playoffs: 'Eliminacion directa',
  championship: 'Grupos y definicion',
}

function MatchCard({ match, onOpen }) {
  const completed = match.status === 'finished'
  const score = completed || match.status === 'in_progress'
  const date = match.scheduled_at
    ? format(toZonedTime(new Date(match.scheduled_at), TZ), "d MMM · HH:mm 'hs'", { locale: es })
    : 'Fecha a definir'

  return (
    <button type="button" onClick={onOpen} className="w-full rounded-lg border border-surface-800 bg-surface-950 p-3 text-left hover:border-primary/35">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-zinc-500">{date}</span>
        <span className={`text-[10px] font-bold uppercase ${completed ? 'text-zinc-400' : 'text-primary'}`}>
          {matchStatusDetail(match)}
        </span>
      </div>
      {[['home', match.home_team_logo_url, match.home_team_name, match.home_team_short_name, match.home_score, match.home_primary_color],
        ['away', match.away_team_logo_url, match.away_team_name, match.away_team_short_name, match.away_score, match.away_primary_color]].map(([side, logo, name, shortName, value, color]) => (
        <div key={side} className="mt-1 flex items-center gap-2">
          <TeamLogo logoUrl={logo} name={name} color={color} size="sm" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-200">{shortName || name}</span>
          {score && <span className="text-sm font-black text-zinc-100">{value ?? 0}</span>}
        </div>
      ))}
    </button>
  )
}

function Bracket({ phases, matches, onOpen }) {
  const knockout = phases.filter((phase) => phase.type === 'knockout')
  return (
    <div className="-mx-3 overflow-x-auto px-3 pb-2">
      <div className="flex min-w-max items-start gap-3">
        {knockout.map((phase) => {
          const phaseMatches = matches.filter((match) => match.phase_id === phase.id)
          return (
            <section key={phase.id} className="w-[17rem] shrink-0 rounded-xl border border-surface-800 bg-surface-900 p-3">
              <div className="mb-3 flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-black text-zinc-100">{phase.name}</h2>
              </div>
              {phaseMatches.length === 0 ? (
                <p className="rounded-lg bg-surface-950 px-3 py-6 text-center text-xs text-zinc-500">Cruces a definir</p>
              ) : (
                <div className="space-y-2">
                  {phaseMatches.map((match) => <MatchCard key={match.id} match={match} onOpen={() => onOpen(match.id)} />)}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

export default function CompetitionDetail() {
  const { leagueId } = useParams()
  const navigate = useNavigate()
  const { isLeagueFavorite, toggleLeagueFavorite } = useFavorites()
  const { data: league, isLoading: loadingLeague } = useLeague(leagueId)
  const { data: phases = [], isLoading: loadingPhases } = usePhases(leagueId)
  const { data: matches = [], isLoading: loadingMatches } = useLeagueMatches(leagueId)

  const groupedMatches = useMemo(() => phases.map((phase) => ({
    phase,
    matches: matches.filter((match) => match.phase_id === phase.id),
  })), [matches, phases])

  if (loadingLeague || loadingPhases || loadingMatches) return <Spinner className="py-16" />
  if (!league) return <p className="px-4 py-12 text-center text-sm text-zinc-500">Competencia no encontrada.</p>

  const knockout = league.format === 'playoffs'

  return (
    <div className="space-y-4 px-3 py-4 pb-28">
      <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-400">
        <ChevronLeft className="h-4 w-4" /> Volver
      </button>

      <header className="rounded-xl border border-surface-800 bg-surface-900 p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
            <Trophy className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase text-primary">{TYPE_LABEL[league.competition_type] || 'Competencia'}</p>
            <h1 className="truncate text-xl font-black text-zinc-100">{league.name}</h1>
            <p className="text-xs capitalize text-zinc-500">{league.sports?.name} · {league.season || league.year} · {league.gender}</p>
          </div>
          <button
            type="button"
            onClick={() => toggleLeagueFavorite(league.id)}
            className={`grid h-9 w-9 place-items-center rounded-full text-xl ${isLeagueFavorite(league.id) ? 'text-amber-400' : 'text-zinc-600'}`}
            aria-label="Marcar competencia favorita"
          >
            {isLeagueFavorite(league.id) ? '★' : '☆'}
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <Badge variant="primary">{FORMAT_LABEL[league.format] || league.format}</Badge>
          <Badge>{matches.length} partidos</Badge>
        </div>
      </header>

      {knockout ? (
        <section>
          <div className="mb-3 flex items-center gap-2 px-1">
            <GitBranch className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-black text-zinc-100">Llaves</h2>
          </div>
          <Bracket phases={phases} matches={matches} onOpen={(matchId) => navigate(`/partido/${matchId}`)} />
        </section>
      ) : (
        <Link to="/posiciones" className="flex items-center justify-between rounded-xl border border-surface-800 bg-surface-900 p-4">
          <span className="flex items-center gap-2 text-sm font-bold text-zinc-100"><Table2 className="h-5 w-5 text-primary" /> Ver tabla de posiciones</span>
          <ChevronLeft className="h-4 w-4 rotate-180 text-zinc-500" />
        </Link>
      )}

      {!knockout && groupedMatches.map(({ phase, matches: phaseMatches }) => (
        <section key={phase.id} className="rounded-xl border border-surface-800 bg-surface-900 p-3">
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-black text-zinc-100">{phase.name}</h2>
          </div>
          {phaseMatches.length === 0 ? (
            <p className="py-5 text-center text-xs text-zinc-500">Sin partidos cargados.</p>
          ) : (
            <div className="space-y-2">
              {phaseMatches.map((match) => <MatchCard key={match.id} match={match} onOpen={() => navigate(`/partido/${match.id}`)} />)}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
