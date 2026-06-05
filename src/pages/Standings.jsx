import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Table2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useLeagues } from '../hooks/useLeagues'
import TeamLogo from '../components/teams/TeamLogo'
import Spinner from '../components/ui/Spinner'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
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
  liga:   { label: 'Liga',   icon: '🏆' },
  copa:   { label: 'Copa',   icon: '🥇' },
  torneo: { label: 'Torneo', icon: '🎯' },
}

// Trae TODAS las posiciones de TODAS las fases (un row por equipo+fase)
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

// Trae TODOS los goleadores agregados por fase (auto + manual via v_top_scorers)
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

function StandingsTable({ rows, onTeamClick }) {
  return (
    <div className="bg-surface-900 rounded-xl border border-surface-800 overflow-hidden">
      <div className="overflow-x-auto" dir="ltr">
      <table className="w-full min-w-[26rem] text-sm">
        <thead className="bg-surface-800 text-zinc-400 text-[10px] uppercase tracking-wide">
          <tr>
            <th className="sticky left-0 z-10 bg-surface-800 px-2 py-2 text-left">#</th>
            <th className="sticky left-8 z-10 bg-surface-800 px-2 py-2 text-left">Equipo</th>
            <th className="px-2 py-2 text-center font-bold text-zinc-200">Pts</th>
            <th className="px-1.5 py-2">PJ</th>
            <th className="px-1.5 py-2">G</th>
            <th className="px-1.5 py-2">E</th>
            <th className="px-1.5 py-2">P</th>
            <th className="px-1.5 py-2">DG</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const pos = row.position ?? i + 1
            const posColor = pos === 1 ? 'text-amber-400'
                           : pos === 2 ? 'text-zinc-300'
                           : pos === 3 ? 'text-amber-700' : 'text-zinc-500'
            return (
              <tr
                key={row.team_id ?? i}
                onClick={() => row.team_id && onTeamClick(row.team_id)}
                className="cursor-pointer border-t border-surface-800 hover:bg-surface-800/50"
              >
                <td className={`sticky left-0 z-10 bg-surface-900 px-2 py-2 font-bold ${posColor}`}>{pos}</td>
                <td className="sticky left-8 z-10 bg-surface-900 px-2 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <TeamLogo logoUrl={row.team_logo_url} name={row.team_name} color={row.primary_color} />
                    <span className="text-zinc-100 text-xs truncate">{row.team_short_name ?? row.team_name}</span>
                  </div>
                </td>
                <td className="px-2 py-2 text-center font-extrabold text-zinc-100 tabular-nums">{row.points}</td>
                <td className="px-1.5 py-2 text-center text-zinc-400">{row.played}</td>
                <td className="px-1.5 py-2 text-center text-zinc-400">{row.won}</td>
                <td className="px-1.5 py-2 text-center text-zinc-400">{row.drawn}</td>
                <td className="px-1.5 py-2 text-center text-zinc-400">{row.lost}</td>
                <td className="px-1.5 py-2 text-center text-zinc-400">{row.goal_diff}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
    </div>
  )
}

function ScorersList({ scorers }) {
  if (scorers.length === 0) return null
  return (
    <div className="mt-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400 mb-2 px-1">⚽ Goleadores</p>
      <div className="bg-surface-900 rounded-xl border border-surface-800 overflow-hidden divide-y divide-surface-800">
        {scorers.map((s, i) => (
          <div key={`${s.player_name}-${s.team_id}-${i}`} className="px-3 py-2 flex items-center gap-2.5">
            <span className="font-bold text-xs text-zinc-500 w-5">{i + 1}</span>
            <TeamLogo logoUrl={s.team_logo} name={s.team_name} color={s.team_color} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-100 truncate font-medium">{s.player_name}</p>
              <p className="text-[10px] text-zinc-500 truncate">{s.team_name}</p>
            </div>
            <span className="font-bold text-primary text-sm tabular-nums">{s.goals}</span>
          </div>
        ))}
      </div>
    </div>
  )
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

function PodiumRow({ row, index }) {
  const pos = row.position ?? index + 1
  const posStyle = pos === 1
    ? 'bg-amber-400 text-amber-950'
    : pos === 2
      ? 'bg-zinc-300 text-zinc-950'
      : 'bg-orange-700 text-white'

  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-950/70 px-3 py-2">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black ${posStyle}`}>
        {pos}
      </span>
      <TeamLogo logoUrl={row.team_logo_url} name={row.team_name} color={row.primary_color} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-black text-zinc-100">{row.team_short_name ?? row.team_name}</p>
        <p className="text-[11px] font-semibold text-zinc-500">{row.played ?? 0} PJ · {row.goal_diff > 0 ? '+' : ''}{row.goal_diff ?? 0} DIF</p>
      </div>
      <div className="text-right">
        <p className="text-lg font-black tabular-nums text-zinc-50">{row.points ?? 0}</p>
        <p className="text-[10px] font-bold uppercase text-zinc-500">PTS</p>
      </div>
    </div>
  )
}

function StandingsSummaryCard({ table, scorers, onOpen }) {
  const compInfo = COMP_LABELS[table.competition_type]
  const topRows = table.rows.slice(0, 3)
  const topScorer = scorers[0]

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full overflow-hidden rounded-2xl border border-surface-800 bg-surface-900 text-left shadow-sm transition-colors hover:border-primary/50"
    >
      <div className="grid gap-0 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0 p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-lg">
              {table.sport_icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-black text-zinc-50">{tableTitle(table)}</p>
              <p className="mt-0.5 truncate text-xs font-semibold text-zinc-500">{tableSubtitle(table)}</p>
            </div>
            {compInfo && (
              <Badge variant="primary">
                {compInfo.icon} {compInfo.label}
              </Badge>
            )}
          </div>

          <div className="mt-4 space-y-2">
            {topRows.map((row, index) => (
              <PodiumRow key={row.team_id ?? index} row={row} index={index} />
            ))}
          </div>

          {topScorer && (
            <div className="mt-3 flex items-center justify-between rounded-xl border border-surface-800 bg-surface-950/50 px-3 py-2">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">Goleador</p>
                <p className="truncate text-xs font-bold text-zinc-100">{topScorer.player_name}</p>
              </div>
              <span className="rounded-full bg-primary/15 px-2 py-1 text-xs font-black text-primary">
                {topScorer.goals} gol{topScorer.goals === 1 ? '' : 'es'}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-surface-800 bg-surface-950/50 px-4 py-3 sm:w-24 sm:flex-col sm:justify-center sm:border-l sm:border-t-0">
          <span className="text-xs font-black uppercase tracking-wide text-zinc-500 sm:[writing-mode:vertical-rl] sm:rotate-180">
            Ver torneo
          </span>
          <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-white shadow-[0_0_28px_rgba(232,78,27,0.22)] transition-transform group-hover:translate-x-1 sm:group-hover:translate-x-0 sm:group-hover:translate-y-1">
            <ChevronRight className="h-5 w-5" />
          </span>
        </div>
      </div>
    </button>
  )
}

export default function Standings() {
  const navigate = useNavigate()
  const { data: ligas = [] }     = useLeagues()
  const { data: standings = [], isLoading: stLoading } = useAllStandings()
  const { data: events = [],    isLoading: scLoading } = useAllScorers()

  const [organizationSel, setOrganizationSel] = useState('')
  const [selectedTable, setSelectedTable] = useState(null)

  // Mapa league_id → liga (con competition_type, sport, etc.)
  const ligaById = useMemo(() => {
    const m = {}
    for (const l of ligas) m[l.id] = l
    return m
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
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [standings])

  // Goleadores agrupados por phase_id (ya pre-agregados desde v_top_scorers)
  const scorersByPhase = useMemo(() => {
    const acc = {}
    for (const ev of events) {
      const phaseId = ev.phase_id
      if (!phaseId) continue
      if (!acc[phaseId]) acc[phaseId] = []
      acc[phaseId].push({
        player_name: ev.player_name,
        team_id:     ev.team_id,
        team_name:   ev.team_short_name ?? ev.team_name ?? '',
        team_logo:   ev.team_logo,
        team_color:  ev.team_color ?? '#E84E1B',
        goals:       Number(ev.goals) || 0,
      })
    }
    // Filtro min 2 goles + ordenar desc
    const out = {}
    for (const pid of Object.keys(acc)) {
      out[pid] = acc[pid]
        .filter((s) => s.goals >= 2)
        .sort((a, b) => b.goals - a.goals)
    }
    return out
  }, [events])

  // Agrupar standings por phase_id, filtrado solo por localidad.
  const tablas = useMemo(() => {
    const byPhase = {}
    for (const row of standings) {
      const liga = ligaById[row.league_id]
      if (liga?.format === 'playoffs') continue
      if (organizationSel && row.organization_id !== organizationSel) continue

      if (!byPhase[row.phase_id]) {
        byPhase[row.phase_id] = {
          phase_id:   row.phase_id,
          phase_name: row.phase_name,
          league_id:  row.league_id,
          league_name: row.league_name,
          gender:     row.gender,
          organization_id: row.organization_id,
          organization_name: row.organization_name,
          organization_city: row.organization_city,
          organization_province: row.organization_province,
          group_id:   row.group_id,
          group_name: row.group_name,
          competition_type: liga?.competition_type ?? null,
          sport_icon: liga?.sports?.icon ?? '🏆',
          season:     liga?.season ?? null,
          rows:       [],
        }
      }
      byPhase[row.phase_id].rows.push(row)
    }
    // Ordenar rows por position dentro de cada phase
    return Object.values(byPhase).map((t) => ({
      ...t,
      rows: [...t.rows].sort((a, b) => (a.position ?? 99) - (b.position ?? 99)),
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
    <div className="px-3 py-5 pb-28 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-zinc-100">Posiciones</h1>
        <p className="text-xs text-zinc-500">{tablas.length} tabla{tablas.length === 1 ? '' : 's'}</p>
      </div>

      {/* Filtros por localidad */}
      <div className="space-y-2">
        {organizations.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3 scrollbar-none">
            <button
              onClick={() => setOrganizationSel('')}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                organizationSel === '' ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-400 hover:bg-surface-700 hover:text-zinc-200'
              }`}
            >
              Todas las localidades
            </button>
            {organizations.map((org) => (
              <button
                key={org.id}
                onClick={() => setOrganizationSel(org.id)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  organizationSel === org.id ? 'bg-primary text-white' : 'bg-surface-800 text-zinc-400 hover:bg-surface-700 hover:text-zinc-200'
                }`}
              >
                {org.city ?? org.name}
              </button>
            ))}
          </div>
        )}

      </div>

      {isLoading && <Spinner className="py-12" />}

      {!isLoading && champions.map((league) => (
        <ChampionCelebration key={league.id} team={league.champion_team} leagueName={league.name} compact />
      ))}

      {!isLoading && bracketCompetitions.map((league) => (
        <button
          key={league.id}
          type="button"
          onClick={() => navigate(`/competencia/${league.id}`)}
          className="flex w-full items-center justify-between rounded-xl border border-surface-800 bg-surface-900 p-4 text-left hover:border-primary/40"
        >
          <div>
            <p className="text-xs font-bold uppercase text-primary">Copa · Eliminacion directa</p>
            <p className="mt-1 text-sm font-black text-zinc-100">{league.name}</p>
            <p className="mt-1 text-xs text-zinc-500">{league.season || league.year} · Ver cuadro de llaves</p>
          </div>
          <span className="text-xl text-primary">›</span>
        </button>
      ))}

      {!isLoading && tablas.length === 0 && bracketCompetitions.length === 0 && (
        <p className="text-center text-zinc-500 py-12 text-sm">
          Aún no hay posiciones para mostrar.
        </p>
      )}

      {tablas.map((t) => (
        <StandingsSummaryCard
          key={t.phase_id}
          table={t}
          scorers={scorersByPhase[t.phase_id] ?? []}
          onOpen={() => setSelectedTable(t)}
        />
      ))}

      <Modal
        open={!!selectedTable}
        onClose={() => setSelectedTable(null)}
        title={selectedTable ? tableTitle(selectedTable) : ''}
        description={selectedTable ? tableSubtitle(selectedTable) : ''}
        eyebrow="Posiciones"
        icon={<Table2 className="h-5 w-5" />}
        size="xl"
      >
        {selectedTable && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {selectedTable.rows.slice(0, 3).map((row, index) => (
                <PodiumRow key={row.team_id ?? index} row={row} index={index} />
              ))}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Tabla completa</p>
                <p className="text-xs font-semibold text-zinc-500">{selectedTable.rows.length} equipos</p>
              </div>
              <StandingsTable rows={selectedTable.rows} onTeamClick={(teamId) => navigate(`/equipo/${teamId}`)} />
            </div>

            <ScorersList scorers={scorersByPhase[selectedTable.phase_id] ?? []} />
          </div>
        )}
      </Modal>

      {/*
      {tablas.map((t) => {
        const compInfo = COMP_LABELS[t.competition_type]
        const scorers  = scorersByPhase[t.phase_id] ?? []
        return (
          <section key={t.phase_id} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <span className="text-base">{t.sport_icon}</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-zinc-100 truncate">
                  {t.league_name}
                  {t.phase_name && t.phase_name !== 'Fase Regular' ? ` · ${t.phase_name}` : ''}
                  {t.group_name ? ` · ${t.group_name}` : ''}
                </p>
                <p className="text-[10px] text-zinc-500 capitalize">
                  {t.season ?? ''}{t.gender ? ` · ${t.gender}` : ''}
                </p>
              </div>
              {compInfo && (
                <Badge variant="primary">
                  {compInfo.icon} {compInfo.label}
                </Badge>
              )}
            </div>

            {(t.organization_city || t.organization_province) && (
              <p className="px-1 text-[10px] font-semibold uppercase text-zinc-500">
                {[t.organization_city, t.organization_province].filter(Boolean).join(', ')}
              </p>
            )}
            <StandingsTable rows={t.rows} onTeamClick={(teamId) => navigate(`/equipo/${teamId}`)} />
            <ScorersList scorers={scorers} />
          </section>
        )
      })}
      */}
    </div>
  )
}
