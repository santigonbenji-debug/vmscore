import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useLeagues } from '../hooks/useLeagues'
import TeamLogo from '../components/teams/TeamLogo'
import Spinner from '../components/ui/Spinner'
import Badge from '../components/ui/Badge'

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

function StandingsTable({ rows }) {
  return (
    <div className="bg-surface-900 rounded-xl border border-surface-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-800 text-zinc-400 text-[10px] uppercase tracking-wide">
          <tr>
            <th className="px-2 py-2 text-left">#</th>
            <th className="px-2 py-2 text-left">Equipo</th>
            <th className="px-1.5 py-2">PJ</th>
            <th className="px-1.5 py-2">G</th>
            <th className="px-1.5 py-2">E</th>
            <th className="px-1.5 py-2">P</th>
            <th className="px-1.5 py-2">DG</th>
            <th className="px-1.5 py-2 font-bold">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const pos = row.position ?? i + 1
            const posColor = pos === 1 ? 'text-amber-400'
                           : pos === 2 ? 'text-zinc-300'
                           : pos === 3 ? 'text-amber-700' : 'text-zinc-500'
            return (
              <tr key={row.team_id ?? i} className="border-t border-surface-800 hover:bg-surface-800/50">
                <td className={`px-2 py-2 font-bold ${posColor}`}>{pos}</td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <TeamLogo logoUrl={row.team_logo_url} name={row.team_name} color={row.primary_color} />
                    <span className="text-zinc-100 text-xs truncate">{row.team_short_name ?? row.team_name}</span>
                  </div>
                </td>
                <td className="px-1.5 py-2 text-center text-zinc-400">{row.played}</td>
                <td className="px-1.5 py-2 text-center text-zinc-400">{row.won}</td>
                <td className="px-1.5 py-2 text-center text-zinc-400">{row.drawn}</td>
                <td className="px-1.5 py-2 text-center text-zinc-400">{row.lost}</td>
                <td className="px-1.5 py-2 text-center text-zinc-400">{row.goal_diff}</td>
                <td className="px-1.5 py-2 text-center font-bold text-zinc-100">{row.points}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
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

const COMP_FILTERS = [
  { key: 'all',    label: 'Todas' },
  { key: 'liga',   label: 'Ligas' },
  { key: 'copa',   label: 'Copas' },
  { key: 'torneo', label: 'Torneos' },
]

export default function Standings() {
  const { data: ligas = [] }     = useLeagues()
  const { data: standings = [], isLoading: stLoading } = useAllStandings()
  const { data: events = [],    isLoading: scLoading } = useAllScorers()

  const [comp, setComp] = useState('all') // all/liga/copa/torneo
  const [ligaSel, setLigaSel] = useState('') // filtro especifico de liga (opcional)

  // Mapa league_id → liga (con competition_type, sport, etc.)
  const ligaById = useMemo(() => {
    const m = {}
    for (const l of ligas) m[l.id] = l
    return m
  }, [ligas])

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

  // Agrupar standings por phase_id, filtrado por competicion / liga seleccionada
  const tablas = useMemo(() => {
    const byPhase = {}
    for (const row of standings) {
      const liga = ligaById[row.league_id]
      // Filtro por tipo de competicion
      if (comp !== 'all' && liga?.competition_type !== comp) continue
      // Filtro por liga especifica
      if (ligaSel && row.league_id !== ligaSel) continue

      if (!byPhase[row.phase_id]) {
        byPhase[row.phase_id] = {
          phase_id:   row.phase_id,
          phase_name: row.phase_name,
          league_id:  row.league_id,
          league_name: row.league_name,
          gender:     row.gender,
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
    }))
  }, [standings, ligaById, comp, ligaSel])

  const isLoading = stLoading || scLoading

  return (
    <div className="px-3 py-5 pb-28 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-zinc-100">Posiciones</h1>
        <p className="text-xs text-zinc-500">{tablas.length} tabla{tablas.length === 1 ? '' : 's'}</p>
      </div>

      {/* Filtros opcionales */}
      <div className="space-y-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3 scrollbar-none">
          {COMP_FILTERS.map((f) => (
            <button key={f.key} onClick={() => { setComp(f.key); setLigaSel('') }}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors
                ${comp === f.key
                  ? 'bg-primary text-white'
                  : 'bg-surface-800 text-zinc-400 hover:bg-surface-700 hover:text-zinc-200'}`}>
              {f.label}
            </button>
          ))}
        </div>

        {ligas.length > 0 && (
          <select value={ligaSel} onChange={(e) => setLigaSel(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm">
            <option value="">Todas las competiciones</option>
            {ligas
              .filter((l) => comp === 'all' || l.competition_type === comp)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.sports?.icon} {l.name}{l.season ? ` · ${l.season}` : ''}
                </option>
              ))}
          </select>
        )}
      </div>

      {isLoading && <Spinner className="py-12" />}

      {!isLoading && tablas.length === 0 && (
        <p className="text-center text-zinc-500 py-12 text-sm">
          Aún no hay posiciones para mostrar.
        </p>
      )}

      {/* Renderizar cada tabla con sus goleadores */}
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

            <StandingsTable rows={t.rows} />
            <ScorersList scorers={scorers} />
          </section>
        )
      })}
    </div>
  )
}
