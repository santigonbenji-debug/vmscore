import { useMemo, useState } from 'react'
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

const LEG_FILTERS = [
  { value: 'all', label: 'Llave' },
  { value: '1', label: 'Ida' },
  { value: '2', label: 'Vuelta' },
]

function teamDisplayName(shortName, name) {
  return shortName?.trim() || name?.trim() || 'Equipo'
}

function scoreValue(value) {
  return value === null || value === undefined ? '-' : value
}

function matchDateLabel(match) {
  if (!match.scheduled_at) return 'Fecha a definir'
  return format(toZonedTime(new Date(match.scheduled_at), TZ), "d MMM · HH:mm 'hs'", { locale: es })
}

function MatchCard({ match, onOpen }) {
  const completed = match.status === 'finished'
  const score = completed || match.status === 'in_progress'

  return (
    <button type="button" onClick={onOpen} className="w-full rounded-lg border border-surface-800 bg-surface-950 p-3 text-left hover:border-primary/35">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-zinc-500">{matchDateLabel(match)}</span>
        <span className={`text-[10px] font-bold uppercase ${completed ? 'text-zinc-400' : 'text-primary'}`}>
          {matchStatusDetail(match)}
        </span>
      </div>
      {[
        ['home', match.home_team_logo_url, match.home_team_name, match.home_team_short_name, match.home_score, match.home_primary_color],
        ['away', match.away_team_logo_url, match.away_team_name, match.away_team_short_name, match.away_score, match.away_primary_color],
      ].map(([side, logo, name, shortName, value, color]) => (
        <div key={side} className="mt-1 flex items-center gap-2">
          <TeamLogo logoUrl={logo} name={name} color={color} size="sm" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-200">{teamDisplayName(shortName, name)}</span>
          {score && <span className="text-sm font-black text-zinc-100">{value ?? 0}</span>}
        </div>
      ))}
    </button>
  )
}

function makeTieKey(match) {
  return [match.home_team_id, match.away_team_id].filter(Boolean).sort().join('|')
}

function buildTies(phaseMatches) {
  const byTie = new Map()

  phaseMatches.forEach((match) => {
    const key = makeTieKey(match) || match.id
    if (!byTie.has(key)) {
      byTie.set(key, {
        key,
        teams: {
          a: {
            id: match.home_team_id,
            name: teamDisplayName(match.home_team_short_name, match.home_team_name),
            logo: match.home_team_logo_url,
            color: match.home_primary_color,
          },
          b: {
            id: match.away_team_id,
            name: teamDisplayName(match.away_team_short_name, match.away_team_name),
            logo: match.away_team_logo_url,
            color: match.away_primary_color,
          },
        },
        matches: [],
      })
    }
    byTie.get(key).matches.push(match)
  })

  return [...byTie.values()].map((tie) => {
    const orderedMatches = [...tie.matches].sort((a, b) => {
      const legDiff = (a.leg ?? 1) - (b.leg ?? 1)
      if (legDiff) return legDiff
      return new Date(a.scheduled_at ?? 0) - new Date(b.scheduled_at ?? 0)
    })

    let scoreA = 0
    let scoreB = 0
    let hasScore = false
    orderedMatches.forEach((match) => {
      if (match.home_score === null || match.home_score === undefined || match.away_score === null || match.away_score === undefined) return
      hasScore = true
      if (match.home_team_id === tie.teams.a.id) {
        scoreA += match.home_score
        scoreB += match.away_score
      } else {
        scoreA += match.away_score
        scoreB += match.home_score
      }
    })

    return { ...tie, matches: orderedMatches, aggregate: hasScore ? { a: scoreA, b: scoreB } : null }
  })
}

function TieCard({ tie, legView, onOpen }) {
  const visibleMatches = legView === 'all'
    ? tie.matches
    : tie.matches.filter((match) => String(match.leg ?? 1) === legView)
  const status = tie.matches.some((match) => match.status === 'in_progress')
    ? 'En vivo'
    : tie.matches.every((match) => match.status === 'finished')
      ? 'Finalizado'
      : 'Programado'

  return (
    <article className="rounded-xl border border-surface-800 bg-surface-950 p-3 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Badge variant={status === 'En vivo' ? 'live' : status === 'Finalizado' ? 'success' : 'default'}>{status}</Badge>
        {tie.aggregate && (
          <span className="rounded-full bg-surface-800 px-2 py-1 text-[11px] font-black text-zinc-200">
            Global {tie.aggregate.a} - {tie.aggregate.b}
          </span>
        )}
      </div>

      {[tie.teams.a, tie.teams.b].map((team, index) => {
        const aggregate = tie.aggregate ? (index === 0 ? tie.aggregate.a : tie.aggregate.b) : null
        const winner = tie.aggregate && tie.aggregate.a !== tie.aggregate.b
          ? (index === 0 ? tie.aggregate.a > tie.aggregate.b : tie.aggregate.b > tie.aggregate.a)
          : false

        return (
          <div key={team.id} className={`flex items-center gap-2 rounded-lg px-2 py-2 ${winner ? 'bg-emerald-500/10 text-white' : 'text-zinc-200'}`}>
            <TeamLogo logoUrl={team.logo} name={team.name} color={team.color} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm font-black">{team.name}</span>
            <span className={`text-sm font-black tabular-nums ${winner ? 'text-emerald-300' : 'text-zinc-300'}`}>
              {aggregate ?? '-'}
            </span>
          </div>
        )
      })}

      <div className="mt-3 space-y-2 border-t border-surface-800 pt-3">
        {visibleMatches.length === 0 ? (
          <p className="rounded-lg bg-surface-900 px-3 py-3 text-center text-xs text-zinc-500">Partido a definir</p>
        ) : visibleMatches.map((match) => (
          <button
            key={match.id}
            type="button"
            onClick={() => onOpen(match.id)}
            className="flex w-full items-center justify-between gap-3 rounded-lg bg-surface-900 px-3 py-2 text-left transition-colors hover:bg-surface-800"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase text-primary">{match.leg === 2 ? 'Vuelta' : 'Ida'}</p>
              <p className="truncate text-xs text-zinc-400">{matchDateLabel(match)}</p>
            </div>
            <div className="shrink-0 text-sm font-black tabular-nums text-zinc-100">
              {scoreValue(match.home_score)} - {scoreValue(match.away_score)}
            </div>
          </button>
        ))}
      </div>
    </article>
  )
}

function Bracket({ phases, matches, legView, onOpen }) {
  const knockout = phases.filter((phase) => phase.type === 'knockout')

  return (
    <div className="-mx-3 overflow-x-auto px-3 pb-2">
      <div className="flex min-w-max items-stretch gap-3">
        {knockout.map((phase) => {
          const phaseMatches = matches.filter((match) => match.phase_id === phase.id)
          const ties = buildTies(phaseMatches)

          return (
            <section key={phase.id} className="w-[19rem] shrink-0 rounded-xl border border-surface-800 bg-surface-900 p-3">
              <div className="mb-3 flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-primary" />
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-black text-zinc-100">{phase.name}</h2>
                  <p className="text-[11px] text-zinc-500">{ties.length || 'Sin'} cruces</p>
                </div>
              </div>
              {ties.length === 0 ? (
                <p className="rounded-lg bg-surface-950 px-3 py-10 text-center text-xs text-zinc-500">Cruces a definir</p>
              ) : (
                <div className="space-y-2">
                  {ties.map((tie) => <TieCard key={tie.key} tie={tie} legView={legView} onOpen={onOpen} />)}
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
  const [legView, setLegView] = useState('all')
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
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="primary">{FORMAT_LABEL[league.format] || league.format}</Badge>
          {league.leg_mode === 'two_legged' && <Badge>Ida y vuelta</Badge>}
          <Badge>{matches.length} partidos</Badge>
        </div>
      </header>

      {knockout ? (
        <section>
          <div className="mb-3 flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-black text-zinc-100">Llaves</h2>
            </div>
            {league.leg_mode === 'two_legged' && (
              <div className="grid grid-cols-3 rounded-xl border border-surface-800 bg-surface-900 p-1">
                {LEG_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setLegView(filter.value)}
                    className={`rounded-lg px-3 py-2 text-xs font-black transition-colors ${
                      legView === filter.value ? 'bg-primary text-white' : 'text-zinc-400 hover:text-zinc-100'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Bracket phases={phases} matches={matches} legView={legView} onOpen={(matchId) => navigate(`/partido/${matchId}`)} />
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
