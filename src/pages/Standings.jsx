import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLeagues } from '../hooks/useLeagues'
import TeamLogo from '../components/teams/TeamLogo'
import Spinner from '../components/ui/Spinner'
import Badge from '../components/ui/Badge'
import ChampionCelebration from '../components/competition/ChampionCelebration'

function normalizeText(value = '') {
  return value
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function competitionOrder(table) {
  const name = normalizeText(table.league_name ?? table.name)
  if (name.includes('primera division a') || name.includes('primera a')) return 10
  if (name.includes('primera division b') || name.includes('primera b')) return 20
  if (name.includes('segunda')) return 30
  if (name.includes('tercera')) return 40
  return 100
}

const COMP_LABELS = {
  liga: 'Liga',
  copa: 'Copa',
  torneo: 'Torneo',
  campeonato: 'Campeonato',
}

function useAllStandings() {
  return useQuery({
    queryKey: ['standings-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_standings')
        .select('*')
        .order('position', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })
}

function useAllScorers() {
  return useQuery({
    queryKey: ['scorers-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_top_scorers')
        .select('*')
        .order('goals', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

function tableTitle(table) {
  return [
    table.league_name,
    table.phase_name && table.phase_name !== 'Fase Regular' ? table.phase_name : '',
    table.group_name,
  ].filter(Boolean).join(' · ')
}

function tableSubtitle(table) {
  return [
    table.organization_city,
    table.season,
    table.gender,
  ].filter(Boolean).join(' · ')
}

function TopThreeRow({ row, index }) {
  const position = row.position ?? index + 1

  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="w-5 shrink-0 text-center text-xs font-black tabular-nums text-zinc-500">
        {position}
      </span>
      <TeamLogo logoUrl={row.team_logo_url} name={row.team_name} color={row.primary_color} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-zinc-100">
        {row.team_short_name ?? row.team_name}
      </span>
      <span className="w-8 text-right text-sm font-black tabular-nums text-zinc-100">{row.points ?? 0}</span>
      <span className="w-8 text-right text-xs font-bold tabular-nums text-zinc-500">{row.played ?? 0}</span>
      <span className="w-9 text-right text-xs font-bold tabular-nums text-zinc-500">
        {row.goal_diff > 0 ? '+' : ''}{row.goal_diff ?? 0}
      </span>
    </div>
  )
}

function StandingsSummaryCard({ table, scorers, onOpen }) {
  const topRows = table.rows.slice(0, 3)
  const topScorer = scorers[0]
  const typeLabel = COMP_LABELS[table.competition_type]

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-stretch overflow-hidden rounded-xl border border-surface-800 bg-surface-900 text-left transition-colors hover:border-primary/40"
    >
      <div className="min-w-0 flex-1 p-3">
        <div className="flex items-start gap-2.5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-800 text-sm">
            {table.sport_icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-zinc-50">{tableTitle(table)}</p>
            <p className="mt-0.5 truncate text-[11px] font-semibold text-zinc-500">{tableSubtitle(table)}</p>
          </div>
          {typeLabel && <Badge>{typeLabel}</Badge>}
        </div>

        <div className="mt-3 flex items-center gap-2 border-b border-surface-800/70 pb-1 text-[9px] font-black uppercase tracking-wide text-zinc-600">
          <span className="w-5 shrink-0 text-center">#</span>
          <span className="flex-1">Equipo</span>
          <span className="w-8 text-right text-zinc-500">PTS</span>
          <span className="w-8 text-right">PJ</span>
          <span className="w-9 text-right">DG</span>
        </div>

        <div className="divide-y divide-surface-800/70">
          {topRows.map((row, index) => (
            <TopThreeRow key={row.team_id ?? index} row={row} index={index} />
          ))}
        </div>

        {topScorer && (
          <p className="mt-2 truncate text-[11px] font-semibold text-zinc-500">
            Goleador: <span className="text-zinc-300">{topScorer.player_name}</span>
            <span className="text-primary"> · {topScorer.goals}</span>
          </p>
        )}
      </div>

      <div className="grid w-10 shrink-0 place-items-center border-l border-surface-800 bg-surface-950/35 text-zinc-500 transition-colors group-hover:text-primary">
        <ChevronRight className="h-5 w-5" />
      </div>
    </button>
  )
}

function PlayoffSummaryCard({ league, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-stretch overflow-hidden rounded-xl border border-surface-800 bg-surface-900 text-left transition-colors hover:border-primary/40"
    >
      <div className="min-w-0 flex-1 p-3">
        <p className="text-[10px] font-black uppercase tracking-wide text-primary">Eliminacion directa</p>
        <p className="mt-1 truncate text-sm font-black text-zinc-50">{league.name}</p>
        <p className="mt-0.5 truncate text-[11px] font-semibold text-zinc-500">
          {[league.organization?.city, league.season || league.year, league.gender].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="grid w-10 shrink-0 place-items-center border-l border-surface-800 bg-surface-950/35 text-zinc-500 transition-colors group-hover:text-primary">
        <ChevronRight className="h-5 w-5" />
      </div>
    </button>
  )
}

export default function Standings() {
  const navigate = useNavigate()
  const { data: ligas = [] } = useLeagues()
  const { data: standings = [], isLoading: stLoading } = useAllStandings()
  const { data: scorers = [], isLoading: scLoading } = useAllScorers()
  const [organizationSel, setOrganizationSel] = useState('')

  const ligaById = useMemo(() => {
    const map = {}
    for (const league of ligas) map[league.id] = league
    return map
  }, [ligas])

  const organizations = useMemo(() => {
    const map = new Map()
    for (const row of standings) {
      if (!row.organization_id) continue
      map.set(row.organization_id, {
        id: row.organization_id,
        name: row.organization_name ?? row.organization_city ?? 'Sin organizacion',
        city: row.organization_city,
        province: row.organization_province,
      })
    }
    return [...map.values()].sort((a, b) => (a.city ?? a.name).localeCompare(b.city ?? b.name))
  }, [standings])

  const scorersByPhase = useMemo(() => {
    const grouped = {}
    for (const scorer of scorers) {
      if (!scorer.phase_id) continue
      grouped[scorer.phase_id] = grouped[scorer.phase_id] ?? []
      grouped[scorer.phase_id].push({
        player_name: scorer.player_name,
        team_name: scorer.team_short_name ?? scorer.team_name ?? '',
        goals: Number(scorer.goals) || 0,
      })
    }
    for (const phaseId of Object.keys(grouped)) {
      grouped[phaseId] = grouped[phaseId]
        .filter((scorer) => scorer.goals > 0)
        .sort((a, b) => b.goals - a.goals)
    }
    return grouped
  }, [scorers])

  const tablas = useMemo(() => {
    const byPhase = {}
    for (const row of standings) {
      const league = ligaById[row.league_id]
      if (league?.format === 'playoffs') continue
      if (organizationSel && row.organization_id !== organizationSel) continue

      if (!byPhase[row.phase_id]) {
        byPhase[row.phase_id] = {
          phase_id: row.phase_id,
          phase_name: row.phase_name,
          league_id: row.league_id,
          league_name: row.league_name,
          gender: row.gender,
          organization_id: row.organization_id,
          organization_city: row.organization_city,
          organization_province: row.organization_province,
          group_id: row.group_id,
          group_name: row.group_name,
          competition_type: league?.competition_type ?? null,
          sport_icon: league?.sports?.icon ?? '•',
          season: league?.season ?? null,
          rows: [],
        }
      }
      byPhase[row.phase_id].rows.push(row)
    }

    return Object.values(byPhase).map((table) => ({
      ...table,
      rows: [...table.rows].sort((a, b) => (a.position ?? 99) - (b.position ?? 99)),
    })).sort((a, b) => (
      competitionOrder(a) - competitionOrder(b) ||
      (a.organization_city ?? '').localeCompare(b.organization_city ?? '') ||
      (a.league_name ?? '').localeCompare(b.league_name ?? '') ||
      (a.phase_name ?? '').localeCompare(b.phase_name ?? '')
    ))
  }, [standings, ligaById, organizationSel])

  const bracketCompetitions = useMemo(() => ligas.filter((league) => (
    league.format === 'playoffs' &&
    (!organizationSel || league.organization_id === organizationSel)
  )).sort((a, b) => (
    competitionOrder(a) - competitionOrder(b) ||
    (a.name ?? '').localeCompare(b.name ?? '')
  )), [ligas, organizationSel])

  const champions = useMemo(() => ligas.filter((league) => (
    league.champion_team &&
    (!organizationSel || league.organization_id === organizationSel)
  )), [ligas, organizationSel])

  const isLoading = stLoading || scLoading

  return (
    <div className="space-y-4 px-3 py-5 pb-28">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-zinc-100">Posiciones</h1>
        <p className="text-xs text-zinc-500">{tablas.length} tabla{tablas.length === 1 ? '' : 's'}</p>
      </div>

      {organizations.length > 1 && (
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 scrollbar-none">
          <button
            onClick={() => setOrganizationSel('')}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              organizationSel === '' ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-400'
            }`}
          >
            Todas las localidades
          </button>
          {organizations.map((org) => (
            <button
              key={org.id}
              onClick={() => setOrganizationSel(org.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                organizationSel === org.id ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-400'
              }`}
            >
              {org.city ?? org.name}
            </button>
          ))}
        </div>
      )}

      {isLoading && <Spinner className="py-12" />}

      {!isLoading && champions.map((league) => (
        <ChampionCelebration key={league.id} team={league.champion_team} leagueName={league.name} compact />
      ))}

      {!isLoading && bracketCompetitions.map((league) => (
        <PlayoffSummaryCard
          key={league.id}
          league={league}
          onOpen={() => navigate(`/competencia/${league.id}`)}
        />
      ))}

      {!isLoading && tablas.map((table) => (
        <StandingsSummaryCard
          key={table.phase_id}
          table={table}
          scorers={scorersByPhase[table.phase_id] ?? []}
          onOpen={() => navigate(`/competencia/${table.league_id}`)}
        />
      ))}

      {!isLoading && tablas.length === 0 && bracketCompetitions.length === 0 && (
        <p className="py-12 text-center text-sm text-zinc-500">
          Aun no hay posiciones para mostrar.
        </p>
      )}
    </div>
  )
}
