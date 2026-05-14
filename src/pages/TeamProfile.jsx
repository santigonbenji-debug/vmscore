import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import FavoriteButton from '../components/teams/FavoriteButton'
import TeamLogo from '../components/teams/TeamLogo'
import Spinner from '../components/ui/Spinner'
import { useTeam } from '../hooks/useTeams'
import { useTeamMatchesWithExternal } from '../hooks/useMatches'
import { useTeamPlayers } from '../hooks/useRosters'
import { useStandingsTablesByPhase, useTeamStandingsTables } from '../hooks/useStandings'
import { formatFechaLarga, formatHora } from '../lib/helpers'

const TABS = [
  { key: 'partidos', label: 'Partidos' },
  { key: 'clasificaciones', label: 'Clasificaciones' },
  { key: 'plantilla', label: 'Plantilla' },
  { key: 'detalles', label: 'Detalles' },
]

const GENDERS = [
  { value: 'masculino', label: 'Masculino' },
  { value: 'femenino', label: 'Femenino' },
  { value: 'mixto', label: 'Mixto' },
]

function competitionKey(item) {
  return item.league_id ?? item.source_id ?? 'sin-competencia'
}

function competitionLabel(item) {
  const pieces = [item.league_name, item.group_name || item.phase_name].filter(Boolean)
  return pieces.join(' · ') || 'Competencia'
}

function resultForTeam(match, teamId) {
  if (match.status !== 'finished') return null
  const isHome = match.home_team_id === teamId
  const ownScore = isHome ? match.home_score : match.away_score
  const rivalScore = isHome ? match.away_score : match.home_score
  if (ownScore === rivalScore) return 'E'
  return ownScore > rivalScore ? 'G' : 'P'
}

function ResultPill({ value }) {
  if (!value) return null
  const classes = {
    G: 'bg-emerald-500 text-surface-950',
    E: 'bg-zinc-500 text-white',
    P: 'bg-red-500 text-white',
  }
  return (
    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${classes[value]}`}>
      {value}
    </span>
  )
}

function CompetitionFilter({ value, onChange, options }) {
  if (options.length <= 1) return null
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-xl border border-surface-800 bg-surface-900 px-3 py-2.5 text-sm font-semibold text-zinc-100 focus:outline-none"
    >
      <option value="all">Todas las competiciones</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>{option.label}</option>
      ))}
    </select>
  )
}

function PlayerList({ title, players }) {
  return (
    <section className="overflow-hidden rounded-xl border border-surface-800 bg-surface-900">
      <div className="flex items-center justify-between border-b border-surface-800 px-3 py-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-400">{title}</h2>
        <span className="text-xs font-semibold text-zinc-500">{players.length}</span>
      </div>
      {players.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-zinc-500">Sin jugadores cargados.</p>
      ) : (
        <div className="divide-y divide-surface-800">
          {players.map((player) => (
            <div key={player.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-800 text-xs font-bold text-zinc-300">
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

function MatchesTab({ teamId, matches, isLoading, filter, onFilterChange, filterOptions, onOpenMatch }) {
  const visible = filter === 'all' ? matches : matches.filter((match) => competitionKey(match) === filter)
  const grouped = useMemo(() => {
    const out = {}
    visible.forEach((match) => {
      const key = `${competitionKey(match)}-${match.group_name ?? match.phase_name ?? 'general'}`
      if (!out[key]) {
        out[key] = {
          key,
          label: competitionLabel(match),
          icon: match.sport_icon,
          matches: [],
        }
      }
      out[key].matches.push(match)
    })
    return Object.values(out).map((group) => ({
      ...group,
      matches: group.matches.sort((a, b) => {
        const aRound = Number(a.round ?? 999)
        const bRound = Number(b.round ?? 999)
        if (aRound !== bRound) return aRound - bRound

        const aTime = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER
        const bTime = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER
        return aTime - bTime
      }),
    }))
  }, [visible])

  if (isLoading) return <Spinner className="py-10" />

  return (
    <div className="space-y-3">
      <CompetitionFilter value={filter} onChange={onFilterChange} options={filterOptions} />

      {visible.length === 0 ? (
        <p className="rounded-xl border border-surface-800 bg-surface-900 px-3 py-8 text-center text-sm text-zinc-500">
          Todavia no hay partidos para este filtro.
        </p>
      ) : (
        grouped.map((group) => (
          <section key={group.key} className="overflow-hidden rounded-2xl border border-surface-800 bg-surface-900">
            <div className="flex items-center gap-2 px-4 py-3">
              <span className="text-base">{group.icon ?? '⚽'}</span>
              <h2 className="min-w-0 flex-1 truncate text-sm font-black text-zinc-100">{group.label}</h2>
            </div>
            <div className="divide-y divide-surface-800">
              {group.matches.map((match) => {
                const isHome = match.home_team_id === teamId
                const result = resultForTeam(match, teamId)
                const clickable = match.clickable && !String(match.id).startsWith('external-')

                return (
                  <button
                    key={match.app_id ?? match.id}
                    type="button"
                    onClick={() => clickable && onOpenMatch(match.id)}
                    disabled={!clickable}
                    className={`grid w-full grid-cols-[4.5rem,1fr,3rem] items-center gap-2 px-4 py-3 text-left ${
                      clickable ? 'hover:bg-surface-800/60' : ''
                    }`}
                  >
                    <div className="text-right text-xs text-zinc-500">
                      {match.scheduled_at ? (
                        <>
                          <p>{formatFechaLarga(match.scheduled_at).split(' de ')[0]}</p>
                          <p className="mt-0.5">{match.status === 'finished' ? 'FT' : formatHora(match.scheduled_at)}</p>
                        </>
                      ) : (
                        <>
                          <p>Fecha {match.round ?? '-'}</p>
                          <p className="mt-0.5">A def.</p>
                        </>
                      )}
                    </div>

                    <div className="min-w-0 border-l border-surface-700 pl-3">
                      <div className="flex items-center gap-2">
                        <TeamLogo logoUrl={match.home_team_logo_url} name={match.home_team_name} color={match.home_primary_color} size="sm" />
                        <span className={`truncate text-sm ${isHome ? 'font-bold text-zinc-100' : 'text-zinc-400'}`}>
                          {match.home_team_short_name ?? match.home_team_name}
                        </span>
                        {match.status === 'finished' && <span className="ml-auto text-sm font-black text-zinc-100">{match.home_score}</span>}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <TeamLogo logoUrl={match.away_team_logo_url} name={match.away_team_name} color={match.away_primary_color} size="sm" />
                        <span className={`truncate text-sm ${!isHome ? 'font-bold text-zinc-100' : 'text-zinc-400'}`}>
                          {match.away_team_short_name ?? match.away_team_name}
                        </span>
                        {match.status === 'finished' && <span className="ml-auto text-sm font-black text-zinc-100">{match.away_score}</span>}
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <ResultPill value={result} />
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

function StandingsTable({ table, teamId }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-surface-800 bg-surface-900">
      <div className="px-4 py-3">
        <h2 className="text-sm font-black text-zinc-100">
          {table.league_name}{table.group_name ? `, ${table.group_name}` : ''}
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">{table.phase_name} · {table.gender}</p>
      </div>
      {!table.team_position && (
        <p className="border-b border-surface-800 px-4 pb-3 text-xs text-amber-300">
          Este equipo tiene partidos en esta competencia, pero todavia no figura en la tabla cargada.
        </p>
      )}
      <div className="grid grid-cols-[3rem,1fr,3rem,3rem,3rem] border-b border-surface-800 px-3 py-2 text-xs font-bold uppercase text-zinc-500">
        <span>#</span>
        <span>Equipo</span>
        <span className="text-center">P</span>
        <span className="text-center">Diff</span>
        <span className="text-right">Pts</span>
      </div>
      {table.rows.map((row) => {
        const active = row.team_id === teamId
        return (
          <div
            key={row.id ?? `${row.phase_id}-${row.team_id}`}
            className={`grid grid-cols-[3rem,1fr,3rem,3rem,3rem] items-center px-3 py-3 text-sm ${
              active ? 'border-l-4 border-primary bg-primary/20 shadow-[inset_0_0_0_1px_rgba(249,75,22,0.28)]' : ''
            }`}
          >
            <span className={`font-black ${active ? 'text-primary' : row.position <= 2 ? 'text-emerald-400' : 'text-zinc-400'}`}>{row.position}</span>
            <div className="flex min-w-0 items-center gap-2">
              <TeamLogo logoUrl={row.team_logo_url} name={row.team_name} color={row.primary_color} size="sm" />
              <span className={`truncate ${active ? 'font-black text-zinc-100' : 'font-semibold text-zinc-300'}`}>
                {row.team_short_name ?? row.team_name}
              </span>
            </div>
            <span className="text-center text-zinc-300">{row.played}</span>
            <span className="text-center text-zinc-300">{row.goal_diff > 0 ? `+${row.goal_diff}` : row.goal_diff}</span>
            <span className="text-right font-black text-zinc-100">{row.points}</span>
          </div>
        )
      })}
    </section>
  )
}

function StandingsTab({ teamId, tables, isLoading, filter, onFilterChange, filterOptions }) {
  const visible = filter === 'all' ? tables : tables.filter((table) => table.league_id === filter)

  if (isLoading) return <Spinner className="py-10" />

  return (
    <div className="space-y-3">
      <CompetitionFilter value={filter} onChange={onFilterChange} options={filterOptions} />
      {visible.length === 0 ? (
        <p className="rounded-xl border border-surface-800 bg-surface-900 px-3 py-8 text-center text-sm text-zinc-500">
          Todavia no hay tabla para este equipo.
        </p>
      ) : (
        visible.map((table) => <StandingsTable key={table.key} table={table} teamId={teamId} />)
      )}
    </div>
  )
}

function RosterTab({ players, isLoading }) {
  if (isLoading) return <Spinner className="py-10" />
  return (
    <div className="space-y-3">
      {GENDERS.map((gender) => (
        <PlayerList
          key={gender.value}
          title={`Plantel ${gender.label}`}
          players={players.filter((player) => (player.gender ?? 'masculino') === gender.value)}
        />
      ))}
    </div>
  )
}

export default function TeamProfile() {
  const { teamId } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState('partidos')
  const [matchFilter, setMatchFilter] = useState('all')
  const [tableFilter, setTableFilter] = useState('all')

  const { data: team, isLoading: loadingTeam } = useTeam(teamId)
  const { data: players = [], isLoading: loadingPlayers } = useTeamPlayers(teamId)
  const { data: matches = [], isLoading: loadingMatches } = useTeamMatchesWithExternal(teamId)
  const phaseIdsFromMatches = useMemo(() => (
    [...new Set(matches.map((match) => match.phase_id).filter(Boolean))]
  ), [matches])
  const { data: teamStandingsTables = [], isLoading: loadingTeamStandings } = useTeamStandingsTables(teamId)
  const { data: phaseStandingsTables = [], isLoading: loadingPhaseStandings } = useStandingsTablesByPhase(teamId, phaseIdsFromMatches)
  const standingsTables = useMemo(() => {
    const byKey = new Map()
    ;[...teamStandingsTables, ...phaseStandingsTables].forEach((table) => {
      const current = byKey.get(table.key)
      if (!current || (!current.team_position && table.team_position)) {
        byKey.set(table.key, table)
      }
    })
    return [...byKey.values()]
  }, [teamStandingsTables, phaseStandingsTables])
  const loadingStandings = loadingTeamStandings || loadingPhaseStandings

  const matchFilterOptions = useMemo(() => {
    const map = new Map()
    matches.forEach((match) => {
      const key = competitionKey(match)
      if (!map.has(key)) map.set(key, { id: key, label: match.league_name ?? 'Competencia' })
    })
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [matches])

  const tableFilterOptions = useMemo(() => {
    const map = new Map()
    standingsTables.forEach((table) => {
      if (!map.has(table.league_id)) map.set(table.league_id, { id: table.league_id, label: table.league_name })
    })
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [standingsTables])

  if (loadingTeam) return <Spinner className="py-16" />

  if (!team) {
    return (
      <div className="px-4 py-10 text-center text-sm text-zinc-500">
        Equipo no encontrado.
      </div>
    )
  }

  return (
    <div className="pb-28">
      <section className="bg-gradient-to-br from-surface-900 via-surface-900 to-surface-800 px-4 pb-3 pt-4">
        <button onClick={() => navigate(-1)} className="mb-4 text-2xl leading-none text-zinc-100">←</button>
        <div className="flex items-center gap-4">
          <TeamLogo logoUrl={team.logo_url} name={team.name} color={team.primary_color} size="xl" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-3xl font-black text-zinc-100">{team.name}</h1>
            <p className="mt-1 text-sm font-semibold text-zinc-400">
              {team.sports?.icon} {team.sports?.name ?? 'Deporte'}{team.short_name ? ` · ${team.short_name}` : ''}
            </p>
          </div>
          <FavoriteButton teamId={team.id} className="shrink-0 text-amber-400" />
        </div>

        <div className="-mx-4 mt-5 flex gap-5 overflow-x-auto px-4 scrollbar-none">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`shrink-0 border-b-4 px-1 pb-2 text-sm font-black transition-colors ${
                tab === item.key
                  ? 'border-zinc-100 text-zinc-100'
                  : 'border-transparent text-zinc-500'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <div className="space-y-4 px-3 py-4">
        {tab === 'partidos' && (
          <MatchesTab
            teamId={team.id}
            matches={matches}
            isLoading={loadingMatches}
            filter={matchFilter}
            onFilterChange={setMatchFilter}
            filterOptions={matchFilterOptions}
            onOpenMatch={(matchId) => navigate(`/partido/${matchId}`)}
          />
        )}

        {tab === 'clasificaciones' && (
          <StandingsTab
            teamId={team.id}
            tables={standingsTables}
            isLoading={loadingStandings}
            filter={tableFilter}
            onFilterChange={setTableFilter}
            filterOptions={tableFilterOptions}
          />
        )}

        {tab === 'plantilla' && (
          <RosterTab players={players} isLoading={loadingPlayers} />
        )}

        {tab === 'detalles' && (
          <section className="rounded-xl border border-surface-800 bg-surface-900 p-4">
            <h2 className="mb-3 text-sm font-black text-zinc-100">Detalles</h2>
            <div className="space-y-2 text-sm text-zinc-300">
              <p>Deporte: {team.sports?.name ?? 'Sin deporte'}</p>
              {team.short_name && <p>Nombre corto: {team.short_name}</p>}
              {team.venues?.name && <p>Cancha: {team.venues.name}</p>}
              {team.venues?.address && <p>Direccion: {team.venues.address}</p>}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
