import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useNews } from '../hooks/useNews'
import FavoriteButton from '../components/teams/FavoriteButton'
import TeamLogo from '../components/teams/TeamLogo'
import { toZonedTime } from 'date-fns-tz'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import Spinner from '../components/ui/Spinner'
import Badge from '../components/ui/Badge'

const TZ = 'America/Argentina/San_Luis'

function useHomeMatches() {
  return useQuery({
    queryKey: ['home-matches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_matches')
        .select('*, external_sources(min_round)')
        .order('scheduled_at', { ascending: true })
        .limit(500)
      if (error) throw error
      return data ?? []
    },
  })
}

function MatchRow({ match, onClick }) {
  const finalizado = match.status === 'finished'
  const enVivo = match.status === 'in_progress'
  const hora = match.scheduled_at
    ? format(toZonedTime(new Date(match.scheduled_at), TZ), 'HH:mm')
    : 'A def.'
  const homeWon = finalizado && match.home_score > match.away_score
  const awayWon = finalizado && match.away_score > match.home_score

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onClick()
      }}
      className="w-full px-3 py-2.5 flex items-center gap-3 border-b border-surface-800 last:border-b-0 hover:bg-surface-800/50 transition-colors text-left"
    >
      <div className="text-xs text-zinc-500 w-12 text-center shrink-0">
        {enVivo ? (
          <span className="text-emerald-400 font-bold animate-pulse">VIVO</span>
        ) : finalizado ? (
          'FT'
        ) : (
          hora
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 min-w-0">
          <FavoriteButton teamId={match.home_team_id} className="-ml-1 p-1" />
          <TeamLogo logoUrl={match.home_team_logo_url} name={match.home_team_name} color={match.home_primary_color} />
          <span className={`text-sm truncate ${homeWon ? 'font-bold text-zinc-100' : 'text-zinc-300'}`}>
            {match.home_team_short_name ?? match.home_team_name}
          </span>
          {finalizado && (
            <span className={`ml-auto text-sm ${homeWon ? 'font-bold text-zinc-100' : 'text-zinc-400'}`}>
              {match.home_score}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <FavoriteButton teamId={match.away_team_id} className="-ml-1 p-1" />
          <TeamLogo logoUrl={match.away_team_logo_url} name={match.away_team_name} color={match.away_primary_color} />
          <span className={`text-sm truncate ${awayWon ? 'font-bold text-zinc-100' : 'text-zinc-300'}`}>
            {match.away_team_short_name ?? match.away_team_name}
          </span>
          {finalizado && (
            <span className={`ml-auto text-sm ${awayWon ? 'font-bold text-zinc-100' : 'text-zinc-400'}`}>
              {match.away_score}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function NewsCarousel({ items, isAdmin, onCreateClick }) {
  if (!items || items.length === 0) {
    if (!isAdmin) return null
    return (
      <button
        onClick={onCreateClick}
        className="w-full bg-surface-900 border border-dashed border-surface-700 rounded-xl py-6 text-zinc-500 text-sm hover:bg-surface-800 transition-colors"
      >
        Crear primera noticia
      </button>
    )
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-bold text-sm text-zinc-100">Noticias</h2>
        {isAdmin && (
          <button onClick={onCreateClick} className="text-xs text-primary font-semibold hover:underline">
            + Nueva
          </button>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto -mx-3 px-3 pb-2 scrollbar-none">
        {items.map((n) => (
          <article
            key={n.id}
            className="shrink-0 w-72 bg-surface-900 border border-surface-800 rounded-xl overflow-hidden shadow-sm"
          >
            {n.image_url && (
              <img src={n.image_url} alt={n.title} className="w-full h-32 object-cover" />
            )}
            <div className="p-3 space-y-1.5">
              {n.pinned && <Badge variant="primary">Destacada</Badge>}
              <h3 className="font-bold text-sm text-zinc-100 line-clamp-2">{n.title}</h3>
              {n.body && <p className="text-xs text-zinc-400 line-clamp-3">{n.body}</p>}
              {n.link_url && (
                <a href={n.link_url} target="_blank" rel="noreferrer" className="inline-block text-xs text-primary font-semibold hover:underline">
                  Leer mas
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function buildLeagueRounds(partidos) {
  const porLiga = {}
  const visibles = partidos.filter((match) => {
    if (match.status === 'cancelled' || match.status === 'postponed') return false
    const minRound = Number(match.external_sources?.min_round) || 1
    return !match.round || match.round >= minRound
  })

  for (const match of visibles) {
    const leagueKey = match.league_id ?? 'sin-liga'
    const roundKey = match.round ?? 'sin-fecha'
    if (!porLiga[leagueKey]) {
      porLiga[leagueKey] = {
        liga: {
          id: leagueKey,
          name: match.league_name ?? 'Sin liga',
          icon: match.sport_icon ?? '⚽',
        },
        rounds: {},
      }
    }
    if (!porLiga[leagueKey].rounds[roundKey]) {
      porLiga[leagueKey].rounds[roundKey] = { round: match.round, partidos: [] }
    }
    porLiga[leagueKey].rounds[roundKey].partidos.push(match)
  }

  return Object.values(porLiga)
    .map((group) => {
      const rounds = Object.values(group.rounds)
        .map((round) => ({
          ...round,
          partidos: round.partidos.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)),
        }))
        .sort((a, b) => {
          if (a.round == null && b.round == null) {
          return String(a.partidos[0]?.external_match_id ?? '').localeCompare(String(b.partidos[0]?.external_match_id ?? ''))
          }
          if (a.round == null) return 1
          if (b.round == null) return -1
          return a.round - b.round
        })

      const activeRound = rounds.find((round) =>
        round.partidos.some((match) => match.status !== 'finished')
      ) ?? rounds.at(-1)

      return { liga: group.liga, ...(activeRound ?? { round: null, partidos: [] }) }
    })
    .filter((group) => group.partidos.length > 0)
    .sort((a, b) => a.liga.name.localeCompare(b.liga.name))
}

export default function Home() {
  const navigate = useNavigate()
  const { isSuperAdmin } = useAuth()
  const { data: partidos = [], isLoading } = useHomeMatches()
  const { data: news = [] } = useNews({ limit: 10 })

  const enVivo = partidos.filter((p) => p.status === 'in_progress')
  const grupos = useMemo(() => buildLeagueRounds(partidos), [partidos])

  return (
    <div className="px-3 py-3 space-y-4 pb-28">
      {isSuperAdmin && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 scrollbar-none">
          <button
            onClick={() => navigate('/admin/noticias')}
            className="flex items-center gap-1.5 bg-primary/10 border border-primary/30 text-primary text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap shrink-0 hover:bg-primary/20 transition-colors"
          >
            Crear Noticia
          </button>
          <button
            onClick={() => navigate('/admin')}
            className="flex items-center gap-1.5 bg-surface-800 border border-surface-700 text-zinc-300 text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap shrink-0 hover:bg-surface-700 transition-colors"
          >
            Panel Admin
          </button>
        </div>
      )}

      <NewsCarousel items={news} isAdmin={isSuperAdmin} onCreateClick={() => navigate('/admin/noticias')} />

      {enVivo.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <h2 className="font-bold text-sm text-emerald-400">En Vivo</h2>
          </div>
          <div className="bg-surface-900 rounded-xl border border-emerald-500/30 shadow-sm overflow-hidden">
            {enVivo.map((p) => (
              <MatchRow key={p.id} match={p} onClick={() => navigate(`/partido/${p.id}`)} />
            ))}
          </div>
        </section>
      )}

      {isLoading && <Spinner className="py-12" />}

      {!isLoading && partidos.length === 0 && (
        <div className="text-center py-16 text-zinc-500">
          <p className="text-3xl mb-2">⚽</p>
          <p className="text-sm font-medium">No hay partidos cargados todavia</p>
        </div>
      )}

      {grupos.map((datos) => {
        const firstMatch = datos.partidos[0]
        const fechaDate = firstMatch?.scheduled_at ? toZonedTime(new Date(firstMatch.scheduled_at), TZ) : null
        return (
          <section key={datos.liga.id}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="bg-primary text-white rounded-lg px-2.5 py-1 shrink-0 text-center min-w-[2.5rem]">
                  <p className="text-[10px] font-bold uppercase leading-none opacity-90">
                    {fechaDate ? format(fechaDate, 'MMM', { locale: es }) : 'FECHA'}
                  </p>
                  <p className="text-lg font-extrabold leading-tight">{datos.round ?? '-'}</p>
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate text-zinc-100">{datos.liga.name}</p>
                  <p className="text-xs text-zinc-500 capitalize">
                    {fechaDate ? format(fechaDate, 'EEEE', { locale: es }) : 'Dia y horario a definir'}
                  </p>
                </div>
              </div>
              <div className="shrink-0 rounded-full bg-surface-800 px-2.5 py-1 text-xs font-bold text-primary">
                Fecha {datos.round ?? '-'}
              </div>
            </div>

            <div className="mb-3">
              <div className="flex items-center gap-2 px-1 py-1.5">
                <span className="text-base">{datos.liga.icon}</span>
                <p className="text-xs font-semibold text-zinc-300">
                  {datos.partidos.length} partido{datos.partidos.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="bg-surface-900 rounded-xl border border-surface-800 shadow-sm overflow-hidden">
                {datos.partidos.map((p) => (
                  <MatchRow key={p.id} match={p} onClick={() => navigate(`/partido/${p.id}`)} />
                ))}
              </div>
            </div>
          </section>
        )
      })}
    </div>
  )
}
