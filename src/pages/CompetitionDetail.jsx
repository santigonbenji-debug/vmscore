import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, GitBranch, Table2, Trophy } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toZonedTime } from 'date-fns-tz'
import { useLeague, usePhases } from '../hooks/useLeagues'
import { useLeagueMatches } from '../hooks/useMatches'
import { useFavorites } from '../hooks/useFavorites'
import TeamLogo from '../components/teams/TeamLogo'
import ChampionCelebration from '../components/competition/ChampionCelebration'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import { matchStatusDetail } from '../lib/helpers'

const TZ = 'America/Argentina/San_Luis'
const BRACKET_CARD_WIDTH = 236
const BRACKET_CARD_HEIGHT = 100
const BRACKET_COLUMN_GAP = 76
const BRACKET_SLOT_HEIGHT = 126
const BRACKET_HEADER_HEIGHT = 48
const BRACKET_CUP_WIDTH = 96

const TYPE_LABEL = {
  liga: 'Liga',
  copa: 'Copa',
  torneo: 'Torneo',
  campeonato: 'Campeonato',
}

const FORMAT_LABEL = {
  round_robin: 'Todos contra todos',
  playoffs: 'Eliminación directa',
  championship: 'Grupos y definición',
}

const LEG_FILTERS = [
  { value: 'all', label: 'Resumen' },
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

function seriesDateLabel(match) {
  if (!match.scheduled_at) return { day: 'A definir', time: '' }
  const date = toZonedTime(new Date(match.scheduled_at), TZ)
  return {
    day: format(date, 'd MMM', { locale: es }),
    time: format(date, 'HH:mm', { locale: es }),
  }
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

function tieStatus(tie) {
  if (tie.matches.some((match) => match.status === 'in_progress')) return 'En vivo'
  if (tie.matches.length > 0 && tie.matches.every((match) => match.status === 'finished')) return 'Finalizado'
  return 'Programado'
}

function tieScore(tie, legView) {
  if (legView === 'all') return tie.aggregate
  const match = tie.matches.find((item) => String(item.leg ?? 1) === legView)
  if (!match || match.home_score == null || match.away_score == null) return null
  return match.home_team_id === tie.teams.a.id
    ? { a: match.home_score, b: match.away_score }
    : { a: match.away_score, b: match.home_score }
}

function BracketTieCard({ tie, legView, onSelect }) {
  const score = tieScore(tie, legView)
  const status = tieStatus(tie)

  return (
    <button
      type="button"
      onClick={onSelect}
      className="h-full w-full overflow-hidden rounded-lg border border-surface-700 bg-[#15191c] text-left shadow-[0_12px_28px_rgba(0,0,0,0.28)] transition-colors hover:border-primary/55"
    >
      <div className="flex h-6 items-center justify-between border-b border-surface-700/80 px-2">
        <span className={`text-[9px] font-black uppercase ${status === 'En vivo' ? 'text-red-400' : 'text-zinc-500'}`}>{status}</span>
        <span className="text-[9px] font-black uppercase text-zinc-500">{legView === 'all' ? 'Global' : legView === '1' ? 'Ida' : 'Vuelta'}</span>
      </div>
      {[tie.teams.a, tie.teams.b].map((team, index) => {
        const value = score ? (index === 0 ? score.a : score.b) : null
        const winner = score && score.a !== score.b
          ? (index === 0 ? score.a > score.b : score.b > score.a)
          : false

        return (
          <div key={team.id} className={`flex h-[37px] items-center gap-2 px-2 ${winner ? 'bg-white/[0.04] text-white' : 'text-zinc-400'}`}>
            <TeamLogo logoUrl={team.logo} name={team.name} color={team.color} size="sm" />
            <span className="min-w-0 flex-1 truncate text-xs font-bold">{team.name}</span>
            <span className={`text-sm font-black tabular-nums ${winner ? 'text-white' : 'text-zinc-500'}`}>
              {value ?? '-'}
            </span>
          </div>
        )
      })}
    </button>
  )
}

function SeriesModal({ selection, onClose, onOpenMatch }) {
  if (!selection) return null
  const { tie, phaseName } = selection
  const status = tieStatus(tie)

  return (
    <Modal
      open
      onClose={onClose}
      title="Serie"
      description={phaseName}
      eyebrow={status}
      icon={<GitBranch className="h-5 w-5" />}
      size="sm"
      contentClassName="pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-surface-800 bg-surface-900 p-3">
          <p className="mb-2 text-[10px] font-black uppercase text-zinc-500">Resultado global</p>
          {[tie.teams.a, tie.teams.b].map((team, index) => (
            <div key={team.id} className="flex items-center gap-3 py-2">
              <TeamLogo logoUrl={team.logo} name={team.name} color={team.color} size="md" />
              <span className="min-w-0 flex-1 truncate text-sm font-black text-zinc-100">{team.name}</span>
              <span className="text-xl font-black tabular-nums text-zinc-100">
                {tie.aggregate ? (index === 0 ? tie.aggregate.a : tie.aggregate.b) : '-'}
              </span>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-surface-800 bg-surface-900">
          {tie.matches.length === 0 ? (
            <p className="px-4 py-5 text-center text-sm text-zinc-500">Partidos a definir</p>
          ) : tie.matches.map((match) => {
            const date = seriesDateLabel(match)
            return (
            <button
              key={match.id}
              type="button"
              onClick={() => onOpenMatch(match.id)}
              className="flex w-full items-center gap-3 border-b border-surface-800 px-3 py-3 text-left last:border-b-0 hover:bg-surface-800/70"
            >
              <div className="w-20 shrink-0">
                <p className="text-[10px] font-black uppercase text-primary">{match.leg === 2 ? 'Vuelta' : 'Ida'}</p>
                <p className="mt-1 text-[11px] leading-tight text-zinc-500">{date.day}</p>
                {date.time && <p className="text-[11px] leading-tight text-zinc-500">{date.time} hs</p>}
              </div>
              <div className="min-w-0 flex-1 border-l border-surface-700 pl-3">
                <p className="truncate text-xs font-bold text-zinc-200">{teamDisplayName(match.home_team_short_name, match.home_team_name)}</p>
                <p className="mt-1 truncate text-xs font-bold text-zinc-200">{teamDisplayName(match.away_team_short_name, match.away_team_name)}</p>
              </div>
              <div className="shrink-0 text-right text-xs font-black tabular-nums text-zinc-100">
                <p>{scoreValue(match.home_score)}</p>
                <p className="mt-1">{scoreValue(match.away_score)}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" />
            </button>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}

function Bracket({ phases, matches, legView, onSelect }) {
  const phaseData = phases
    .filter((phase) => phase.type === 'knockout')
    .map((phase) => ({ phase, ties: buildTies(matches.filter((match) => match.phase_id === phase.id)) }))
  const baseCount = Math.max(1, ...phaseData.map(({ ties }) => ties.length))
  const diagramHeight = Math.max(280, baseCount * BRACKET_SLOT_HEIGHT)
  const diagramWidth = phaseData.length * BRACKET_CARD_WIDTH + Math.max(0, phaseData.length - 1) * BRACKET_COLUMN_GAP + (phaseData.length ? BRACKET_CUP_WIDTH : 0)
  const centerFor = (index, count) => ((index + 0.5) * baseCount * BRACKET_SLOT_HEIGHT) / Math.max(count, 1)
  const connections = []

  phaseData.slice(0, -1).forEach(({ ties }, phaseIndex) => {
    const nextTies = phaseData[phaseIndex + 1].ties
    ties.forEach((tie, tieIndex) => {
      if (nextTies.length === 0) return
      const teamIds = [tie.teams.a.id, tie.teams.b.id]
      const detectedTarget = nextTies.findIndex((nextTie) => (
        teamIds.includes(nextTie.teams.a.id) || teamIds.includes(nextTie.teams.b.id)
      ))
      const nextIndex = detectedTarget >= 0
        ? detectedTarget
        : Math.min(nextTies.length - 1, Math.floor((tieIndex * nextTies.length) / Math.max(ties.length, 1)))
      const x1 = (phaseIndex + 1) * BRACKET_CARD_WIDTH + phaseIndex * BRACKET_COLUMN_GAP
      const x2 = x1 + BRACKET_COLUMN_GAP
      const y1 = BRACKET_HEADER_HEIGHT + centerFor(tieIndex, ties.length)
      const y2 = BRACKET_HEADER_HEIGHT + centerFor(nextIndex, nextTies.length)
      const mid = x1 + BRACKET_COLUMN_GAP / 2
      connections.push(`M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`)
    })
  })
  const lastPopulatedIndex = phaseData.findLastIndex(({ ties }) => ties.length > 0)
  const lastPopulatedPhase = lastPopulatedIndex >= 0 ? phaseData[lastPopulatedIndex] : null
  if (lastPopulatedPhase) {
    const sourceX = (lastPopulatedIndex + 1) * BRACKET_CARD_WIDTH + lastPopulatedIndex * BRACKET_COLUMN_GAP
    const targetX = diagramWidth - 48
    const targetY = BRACKET_HEADER_HEIGHT + diagramHeight / 2
    lastPopulatedPhase.ties.forEach((_, index) => {
      const sourceY = BRACKET_HEADER_HEIGHT + centerFor(index, lastPopulatedPhase.ties.length)
      const mid = sourceX + 24
      connections.push(`M ${sourceX} ${sourceY} H ${mid} V ${targetY} H ${targetX}`)
    })
  }

  return (
    <div className="-mx-3 overflow-x-auto px-3 pb-2">
      <div className="relative min-w-max" style={{ height: diagramHeight + BRACKET_HEADER_HEIGHT, width: diagramWidth }}>
        <svg className="pointer-events-none absolute inset-0 overflow-visible" width={diagramWidth} height={diagramHeight + BRACKET_HEADER_HEIGHT} aria-hidden="true">
          {connections.map((path, index) => (
            <path key={`${path}-${index}`} d={path} fill="none" stroke="#34383c" strokeWidth="2" />
          ))}
        </svg>
        {phaseData.map(({ phase, ties }, phaseIndex) => {
          const left = phaseIndex * (BRACKET_CARD_WIDTH + BRACKET_COLUMN_GAP)
          return (
            <section key={phase.id}>
              <div className="absolute top-0 flex items-center gap-2" style={{ left, width: BRACKET_CARD_WIDTH }}>
                <GitBranch className="h-4 w-4 text-primary" />
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-black text-zinc-100">{phase.name}</h2>
                  <p className="text-[10px] font-bold uppercase text-zinc-600">{ties.length || 'Sin'} cruces</p>
                </div>
              </div>
              {ties.length === 0 ? (
                <div className="absolute rounded-lg border border-dashed border-surface-700 bg-surface-900/60 p-4 text-center text-xs text-zinc-600" style={{ left, top: BRACKET_HEADER_HEIGHT + 80, width: BRACKET_CARD_WIDTH }}>
                  Cruces a definir
                </div>
              ) : ties.map((tie, tieIndex) => (
                <div
                  key={tie.key}
                  className="absolute"
                  style={{
                    height: BRACKET_CARD_HEIGHT,
                    left,
                    top: BRACKET_HEADER_HEIGHT + centerFor(tieIndex, ties.length) - BRACKET_CARD_HEIGHT / 2,
                    width: BRACKET_CARD_WIDTH,
                  }}
                >
                  <BracketTieCard tie={tie} legView={legView} onSelect={() => onSelect(tie, phase.name)} />
                </div>
              ))}
            </section>
          )
        })}
        {phaseData.length > 0 && (
          <div
            className="absolute grid h-12 w-12 place-items-center rounded-full border border-amber-400/45 bg-amber-400/10 text-amber-300 shadow-[0_0_28px_rgba(251,191,36,0.16)]"
            style={{
              left: diagramWidth - 48,
              top: BRACKET_HEADER_HEIGHT + diagramHeight / 2 - 24,
            }}
            title="Campeon"
          >
            <Trophy className="h-6 w-6" />
          </div>
        )}
      </div>
    </div>
  )
}

function BracketRounds({ phases, matches, legView, onSelect }) {
  const phaseData = phases
    .filter((phase) => phase.type === 'knockout')
    .map((phase) => ({ phase, ties: buildTies(matches.filter((match) => match.phase_id === phase.id)) }))

  return (
    <div className="space-y-4">
      {phaseData.map(({ phase, ties }) => (
        <section key={phase.id} className="rounded-xl border border-surface-800 bg-surface-900 p-3">
          <div className="mb-3 flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-primary" />
            <div className="min-w-0">
              <h3 className="text-sm font-black text-zinc-100">{phase.name}</h3>
              <p className="text-[10px] font-bold uppercase text-zinc-600">{ties.length || 'Sin'} cruces</p>
            </div>
          </div>
          {ties.length === 0 ? (
            <p className="rounded-lg border border-dashed border-surface-700 px-3 py-5 text-center text-xs text-zinc-600">Cruces a definir</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {ties.map((tie) => (
                <div key={tie.key} className="h-[100px]">
                  <BracketTieCard tie={tie} legView={legView} onSelect={() => onSelect(tie, phase.name)} />
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}

export default function CompetitionDetail() {
  const { leagueId } = useParams()
  const navigate = useNavigate()
  const [legView, setLegView] = useState('all')
  const [bracketView, setBracketView] = useState('path')
  const [selectedTie, setSelectedTie] = useState(null)
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

      <ChampionCelebration team={league.champion_team} leagueName={league.name} />

      {knockout ? (
        <section>
          <div className="mb-3 flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-black text-zinc-100">Llaves</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="grid grid-cols-2 rounded-xl border border-surface-800 bg-surface-900 p-1">
                {[
                  { value: 'path', label: 'Camino' },
                  { value: 'rounds', label: 'Rondas' },
                ].map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setBracketView(filter.value)}
                    className={`rounded-lg px-3 py-2 text-xs font-black transition-colors ${
                      bracketView === filter.value ? 'bg-primary text-white' : 'text-zinc-400 hover:text-zinc-100'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
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
          </div>
          {bracketView === 'path' ? (
            <Bracket phases={phases} matches={matches} legView={legView} onSelect={(tie, phaseName) => setSelectedTie({ tie, phaseName })} />
          ) : (
            <BracketRounds phases={phases} matches={matches} legView={legView} onSelect={(tie, phaseName) => setSelectedTie({ tie, phaseName })} />
          )}
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

      <SeriesModal
        selection={selectedTie}
        onClose={() => setSelectedTie(null)}
        onOpenMatch={(matchId) => navigate(`/partido/${matchId}`)}
      />
    </div>
  )
}
