import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useFavorites } from '../hooks/useFavorites'
import { useTeams }     from '../hooks/useTeams'
import { toZonedTime } from 'date-fns-tz'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import FavoriteButton from '../components/teams/FavoriteButton'
import TeamLogo from '../components/teams/TeamLogo'
import Spinner from '../components/ui/Spinner'

const TZ = 'America/Argentina/San_Luis'

function useAllMatchesByTeams(teamIds) {
  return useQuery({
    queryKey: ['fav-matches', [...teamIds].sort()],
    queryFn: async () => {
      if (!teamIds.length) return []
      const { data, error } = await supabase
        .from('v_matches')
        .select('*')
        .or(`home_team_id.in.(${teamIds.join(',')}),away_team_id.in.(${teamIds.join(',')})`)
        .order('scheduled_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: teamIds.length > 0,
  })
}

function MatchRow({ p, onClick, favoriteIds }) {
  const finalizado = p.status === 'finished'
  const enVivo     = p.status === 'in_progress'
  const hora = p.scheduled_at
    ? format(toZonedTime(new Date(p.scheduled_at), TZ), 'HH:mm')
    : 'A def.'
  const homeWon = finalizado && p.home_score > p.away_score
  const awayWon = finalizado && p.away_score > p.home_score
  const localFav = favoriteIds.includes(p.home_team_id)
  const visiFav  = favoriteIds.includes(p.away_team_id)

  return (
    <div onClick={onClick}
      className="flex items-center gap-2 px-3 py-2.5 hover:bg-surface-800/60 cursor-pointer transition-colors border-b border-surface-800 last:border-0">
      <div className="w-12 shrink-0 text-center">
        {enVivo
          ? <span className="text-emerald-400 text-[11px] font-bold tracking-wide animate-pulse">VIVO</span>
          : finalizado
            ? <span className="text-[11px] text-zinc-500 font-semibold">FT</span>
            : <span className="text-xs text-zinc-300 font-medium">{hora}</span>}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <TeamLogo logoUrl={p.home_team_logo_url} name={p.home_team_name} color={p.home_primary_color} size="sm" />
          <span className={`text-sm flex-1 truncate ${homeWon ? 'font-bold text-zinc-100' : finalizado ? 'text-zinc-500' : 'font-medium text-zinc-200'}`}>
            {p.home_team_short_name ?? p.home_team_name}
          </span>
          {localFav && <span className="text-amber-400 text-[10px] shrink-0">★</span>}
          {(finalizado || enVivo) && (
            <span className={`text-sm font-bold tabular-nums shrink-0 ${homeWon ? 'text-zinc-100' : finalizado ? 'text-zinc-500' : 'text-emerald-400'}`}>
              {p.home_score}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <TeamLogo logoUrl={p.away_team_logo_url} name={p.away_team_name} color={p.away_primary_color} size="sm" />
          <span className={`text-sm flex-1 truncate ${awayWon ? 'font-bold text-zinc-100' : finalizado ? 'text-zinc-500' : 'font-medium text-zinc-200'}`}>
            {p.away_team_short_name ?? p.away_team_name}
          </span>
          {visiFav && <span className="text-amber-400 text-[10px] shrink-0">★</span>}
          {(finalizado || enVivo) && (
            <span className={`text-sm font-bold tabular-nums shrink-0 ${awayWon ? 'text-zinc-100' : finalizado ? 'text-zinc-500' : 'text-emerald-400'}`}>
              {p.away_score}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function groupByDate(partidos) {
  const out = {}
  for (const p of partidos) {
    const key = p.scheduled_at
      ? format(toZonedTime(new Date(p.scheduled_at), TZ), 'yyyy-MM-dd')
      : `fecha-${p.league_id ?? 'sin-liga'}-${p.round ?? 'sin-fecha'}`
    if (!out[key]) out[key] = []
    out[key].push(p)
  }
  return out
}

function FechaCard({ fecha, partidos, favoriteIds, onMatchClick }) {
  const isRoundOnly = fecha.startsWith('fecha-')
  const fechaDate = isRoundOnly ? null : new Date(fecha + 'T12:00:00')
  return (
    <div className="mb-3">
      <p className="text-[11px] font-semibold text-zinc-500 mb-1.5 px-1 capitalize">
        {fechaDate ? format(fechaDate, "EEEE d 'de' MMMM", { locale: es }) : `Fecha ${partidos[0]?.round ?? '-'} · horario a definir`}
      </p>
      <div className="bg-surface-900 rounded-xl border border-surface-800 overflow-hidden">
        {partidos.map((p) => (
          <MatchRow key={p.id} p={p} favoriteIds={favoriteIds} onClick={() => onMatchClick(p.id)} />
        ))}
      </div>
    </div>
  )
}

export default function Favorites() {
  const navigate  = useNavigate()
  const { favorites } = useFavorites()
  const { data: equipos = [], isLoading: loadingEquipos } = useTeams()

  const [tab, setTab]       = useState('matches')
  const [search, setSearch] = useState('')

  const equiposFav = useMemo(
    () => equipos.filter((e) => favorites.includes(e.id)),
    [equipos, favorites]
  )

  const equiposBuscar = useMemo(() => {
    const q = search.trim().toLowerCase()
    return equipos
      .filter((e) => !q || (e.name ?? '').toLowerCase().includes(q) || (e.short_name ?? '').toLowerCase().includes(q))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  }, [equipos, search])

  const { data: partidos = [], isLoading: loadingPartidos } = useAllMatchesByTeams(favorites)

  const [ahora] = useState(() => Date.now())
  const { proximos, finalizados, enVivo } = useMemo(() => {
    const next = []
    const past = []
    const live = []
    for (const p of partidos) {
      if (p.status === 'in_progress') live.push(p)
      else if (p.status === 'finished' || (p.scheduled_at && new Date(p.scheduled_at).getTime() < ahora - 6 * 3600 * 1000)) past.push(p)
      else next.push(p)
    }
    next.sort((a, b) => (new Date(a.scheduled_at ?? 0)) - (new Date(b.scheduled_at ?? 0)))
    past.sort((a, b) => (new Date(b.scheduled_at ?? 0)) - (new Date(a.scheduled_at ?? 0)))
    return { proximos: next, finalizados: past, enVivo: live }
  }, [partidos, ahora])

  if (!loadingEquipos && favorites.length === 0) {
    return (
      <div className="px-4 py-6 pb-28">
        <h1 className="text-2xl font-extrabold mb-2 text-zinc-100">Favoritos</h1>
        <p className="text-sm text-zinc-400 mb-5">
          Marcá tus equipos para seguir todos sus partidos.
        </p>

        <input
          type="text" placeholder="Buscar equipo..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg px-3 py-2.5 text-sm mb-4" />

        {equiposBuscar.length === 0 ? (
          <p className="text-center text-zinc-500 text-sm py-12">
            {equipos.length === 0 ? 'Aún no hay equipos cargados.' : 'No se encontraron equipos.'}
          </p>
        ) : (
          <div className="bg-surface-900 rounded-xl border border-surface-800 divide-y divide-surface-800">
            {equiposBuscar.map((e) => (
              <div key={e.id} className="px-3 py-2.5 flex items-center gap-3">
                <TeamLogo logoUrl={e.logo_url} name={e.name} color={e.primary_color} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-100 truncate font-medium">{e.name}</p>
                  <p className="text-[10px] text-zinc-500 truncate">{e.sports?.name}</p>
                </div>
                <FavoriteButton teamId={e.id} />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const isLoading = loadingEquipos || loadingPartidos

  return (
    <div className="px-3 py-5 pb-28">
      <div className="flex items-center justify-between mb-4 px-1">
        <h1 className="text-2xl font-extrabold text-zinc-100">Favoritos</h1>
        <button onClick={() => setTab(tab === 'search' ? 'matches' : 'search')}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
          {tab === 'search' ? '✓ Listo' : '+ Agregar equipos'}
        </button>
      </div>

      {tab === 'search' && (
        <section className="mb-5 space-y-2">
          <input
            type="text" placeholder="Buscar equipo..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm" />
          <div className="bg-surface-900 rounded-xl border border-surface-800 divide-y divide-surface-800 max-h-96 overflow-y-auto">
            {equiposBuscar.map((e) => (
              <div key={e.id} className="px-3 py-2.5 flex items-center gap-3">
                <TeamLogo logoUrl={e.logo_url} name={e.name} color={e.primary_color} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-100 truncate font-medium">{e.name}</p>
                  <p className="text-[10px] text-zinc-500 truncate">{e.sports?.name}</p>
                </div>
                <FavoriteButton teamId={e.id} />
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'matches' && (
        <>
          {equiposFav.length > 0 && (
            <section className="mb-5">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-400 mb-2 px-1">
                Mis equipos · {equiposFav.length}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 scrollbar-none">
                {equiposFav.map((e) => (
                  <div key={e.id} role="button" tabIndex={0}
                    onClick={() => navigate(`/equipo/${e.id}`)}
                    onKeyDown={(ev) => ev.key === 'Enter' && navigate(`/equipo/${e.id}`)}
                    className="shrink-0 bg-surface-900 border border-surface-800 rounded-xl px-3 py-2 flex items-center gap-2 min-w-[140px] cursor-pointer hover:bg-surface-800 transition-colors">
                    <TeamLogo logoUrl={e.logo_url} name={e.name} color={e.primary_color} size="sm" />
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-xs font-semibold text-zinc-100 truncate">{e.short_name ?? e.name}</p>
                      <p className="text-[10px] text-zinc-500 truncate">{e.sports?.name}</p>
                    </div>
                    <FavoriteButton teamId={e.id} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {isLoading && <Spinner className="py-12" />}

          {enVivo.length > 0 && (
            <section className="mb-5">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-400 mb-2 px-1 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                En vivo · {enVivo.length}
              </p>
              <div className="bg-surface-900 rounded-xl border border-emerald-500/30 overflow-hidden">
                {enVivo.map((p) => (
                  <MatchRow key={p.id} p={p} favoriteIds={favorites}
                    onClick={() => navigate(`/partido/${p.id}`)} />
                ))}
              </div>
            </section>
          )}

          {proximos.length > 0 && (
            <section className="mb-5">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-400 mb-2 px-1">
                Próximos · {proximos.length}
              </p>
              {Object.entries(groupByDate(proximos)).map(([fecha, lista]) => (
                <FechaCard key={fecha} fecha={fecha} partidos={lista}
                  favoriteIds={favorites} onMatchClick={(id) => navigate(`/partido/${id}`)} />
              ))}
            </section>
          )}

          {finalizados.length > 0 && (
            <section className="mb-5">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-400 mb-2 px-1">
                Jugados · {finalizados.length}
              </p>
              {Object.entries(groupByDate(finalizados)).map(([fecha, lista]) => (
                <FechaCard key={fecha} fecha={fecha} partidos={lista}
                  favoriteIds={favorites} onMatchClick={(id) => navigate(`/partido/${id}`)} />
              ))}
            </section>
          )}

          {!isLoading && partidos.length === 0 && (
            <div className="text-center py-12 text-zinc-500">
              <p className="text-3xl mb-2">⭐</p>
              <p className="text-sm">Tus equipos todavía no tienen partidos cargados.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
