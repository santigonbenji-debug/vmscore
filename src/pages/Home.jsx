import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toZonedTime } from 'date-fns-tz'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useNews } from '../hooks/useNews'
import FavoriteButton from '../components/teams/FavoriteButton'
import TeamLogo from '../components/teams/TeamLogo'
import Spinner from '../components/ui/Spinner'
import Badge from '../components/ui/Badge'

const TZ = 'America/Argentina/San_Luis'

function useHomeMatches() {
  return useQuery({
    queryKey: ['home-matches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_matches')
        .select('*')
        .order('scheduled_at', { ascending: true })
        .limit(500)
      if (error) throw error
      return data ?? []
    },
  })
}

function getDateLabel(date) {
  const today = toZonedTime(new Date(), TZ)
  const diff = differenceInCalendarDays(date, today)
  if (diff === -1) return 'Ayer'
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  return format(date, "EEE d 'de' MMM", { locale: es })
}

function buildDateGroups(partidos, mode = 'upcoming') {
  const groups = {}
  const visibles = partidos.filter((match) => match.status !== 'cancelled' && match.status !== 'postponed')

  for (const match of visibles) {
    const fecha = match.scheduled_at ? toZonedTime(new Date(match.scheduled_at), TZ) : null
    const dayKey = fecha
      ? format(fecha, 'yyyy-MM-dd')
      : `sin-fecha-${match.league_id ?? 'sin-liga'}-${match.round ?? 'x'}`

    if (!groups[dayKey]) {
      groups[dayKey] = {
        key: dayKey,
        fecha,
        round: match.round,
        leagues: {},
      }
    }

    const leagueKey = match.league_id ?? 'sin-liga'
    if (!groups[dayKey].leagues[leagueKey]) {
      groups[dayKey].leagues[leagueKey] = {
        id: leagueKey,
        name: match.league_name ?? 'Sin liga',
        icon: match.sport_icon ?? '⚽',
        partidos: [],
      }
    }

    groups[dayKey].leagues[leagueKey].partidos.push(match)
  }

  return Object.values(groups)
    .map((day) => ({
      ...day,
      leagues: Object.values(day.leagues)
        .map((league) => ({
          ...league,
          partidos: league.partidos.sort((a, b) => {
            if (!a.scheduled_at && !b.scheduled_at) return String(a.id).localeCompare(String(b.id))
            if (!a.scheduled_at) return 1
            if (!b.scheduled_at) return -1
            return new Date(a.scheduled_at) - new Date(b.scheduled_at)
          }),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      if (!a.fecha && !b.fecha) return Number(a.round ?? 999) - Number(b.round ?? 999)
      if (!a.fecha) return mode === 'upcoming' ? 1 : -1
      if (!b.fecha) return mode === 'upcoming' ? -1 : 1
      return mode === 'previous' ? b.fecha - a.fecha : a.fecha - b.fecha
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

export default function Home() {
  const navigate = useNavigate()
  const { isSuperAdmin } = useAuth()
  const [matchMode, setMatchMode] = useState('upcoming')
  const { data: partidos = [], isLoading } = useHomeMatches()
  const { data: news = [] } = useNews({ limit: 10 })
  const todayKey = format(toZonedTime(new Date(), TZ), 'yyyy-MM-dd')
  const filteredMatches = useMemo(() => (
    partidos.filter((match) => {
      if (match.status === 'cancelled' || match.status === 'postponed') return false
      if (matchMode === 'previous') return match.status === 'finished'
      if (match.status === 'finished') return false
      if (!match.scheduled_at) return true
      return format(toZonedTime(new Date(match.scheduled_at), TZ), 'yyyy-MM-dd') >= todayKey
    })
  ), [matchMode, partidos, todayKey])
  const grupos = useMemo(() => buildDateGroups(filteredMatches, matchMode), [filteredMatches, matchMode])
  const modeCounts = useMemo(() => ({
    upcoming: partidos.filter((match) => {
      if (match.status === 'finished' || match.status === 'cancelled' || match.status === 'postponed') return false
      if (!match.scheduled_at) return true
      return format(toZonedTime(new Date(match.scheduled_at), TZ), 'yyyy-MM-dd') >= todayKey
    }).length,
    previous: partidos.filter((match) => match.status === 'finished').length,
  }), [partidos, todayKey])

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

      <div className="grid grid-cols-2 rounded-xl border border-surface-800 bg-surface-900 p-1">
        {[
          ['previous', 'Anteriores'],
          ['upcoming', 'Proximos'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMatchMode(key)}
            className={`rounded-lg px-3 py-2 text-xs font-black transition-colors ${
              matchMode === key
                ? 'bg-primary text-white'
                : 'text-zinc-400 hover:bg-surface-800 hover:text-zinc-100'
            }`}
          >
            {label}
            {modeCounts[key] > 0 && <span className="ml-1 opacity-75">{modeCounts[key]}</span>}
          </button>
        ))}
      </div>

      {isLoading && <Spinner className="py-12" />}

      {!isLoading && partidos.length === 0 && (
        <div className="text-center py-16 text-zinc-500">
          <p className="text-3xl mb-2">⚽</p>
          <p className="text-sm font-medium">No hay partidos cargados todavia</p>
        </div>
      )}

      {!isLoading && partidos.length > 0 && grupos.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          <p className="text-sm font-medium">
            {matchMode === 'previous' ? 'Todavia no hay partidos anteriores.' : 'Todavia no hay proximos partidos cargados.'}
          </p>
        </div>
      )}

      {grupos.map((day) => (
        <section key={day.key}>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="bg-primary text-white rounded-lg px-2.5 py-1 shrink-0 text-center min-w-[2.5rem]">
                <p className="text-[10px] font-bold uppercase leading-none opacity-90">
                  {day.fecha ? format(day.fecha, 'MMM', { locale: es }) : 'FECHA'}
                </p>
                <p className="text-lg font-extrabold leading-tight">
                  {day.fecha ? format(day.fecha, 'd') : day.round ?? '-'}
                </p>
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm truncate text-zinc-100">
                  {day.fecha ? getDateLabel(day.fecha) : `Fecha ${day.round ?? '-'}`}
                </p>
                <p className="text-xs text-zinc-500 capitalize">
                  {day.fecha ? format(day.fecha, 'EEEE', { locale: es }) : 'Dia y horario a definir'}
                </p>
              </div>
            </div>
            {day.round && (
              <div className="shrink-0 rounded-full bg-surface-800 px-2.5 py-1 text-xs font-bold text-primary">
                Fecha {day.round}
              </div>
            )}
          </div>

          {day.leagues.map((league) => (
            <div key={league.id} className="mb-3">
              <div className="flex items-center gap-2 px-1 py-1.5">
                <span className="text-base">{league.icon}</span>
                <p className="text-xs font-semibold text-zinc-300 truncate">{league.name}</p>
              </div>
              <div className="bg-surface-900 rounded-xl border border-surface-800 shadow-sm overflow-hidden">
                {league.partidos.map((p) => (
                  <MatchRow key={p.id} match={p} onClick={() => navigate(`/partido/${p.id}`)} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
