import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMatch } from '../hooks/useMatches'
import { useMatchLineups } from '../hooks/useLineups'
import FavoriteButton from '../components/teams/FavoriteButton'
import TeamLogo from '../components/teams/TeamLogo'
import Spinner from '../components/ui/Spinner'
import Badge from '../components/ui/Badge'
import { formatFechaLarga, formatHora, labelStatus } from '../lib/helpers'

const TABS = [
  { key: 'info', label: 'Info' },
  { key: 'eventos', label: 'Eventos' },
  { key: 'formacion', label: 'Formacion' },
]

const EVENT_LABEL = {
  goal: 'Gol',
  own_goal: 'Gol en contra',
  penalty_goal: 'Penal',
  yellow_card: 'Amarilla',
  red_card: 'Roja',
  yellow_red_card: 'Doble amarilla',
  substitution: 'Cambio',
}

function LineupColumn({ title, lineups }) {
  const titulares = lineups.filter((lineup) => lineup.role === 'starter')
  const suplentes = lineups.filter((lineup) => lineup.role === 'substitute')

  return (
    <div className="bg-surface-900 rounded-xl border border-surface-800 p-3">
      <p className="text-xs font-semibold text-zinc-400 uppercase mb-2">{title}</p>
      <ul className="space-y-1 mb-3">
        {titulares.map((lineup) => (
          <li key={lineup.id} className="text-sm text-zinc-100 flex justify-between gap-2">
            <span className="truncate">{lineup.shirt_number ? `#${lineup.shirt_number} ` : ''}{lineup.player_name}</span>
            {lineup.position && <span className="text-xs text-zinc-500 shrink-0">{lineup.position}</span>}
          </li>
        ))}
        {titulares.length === 0 && (
          <li className="text-xs text-zinc-500 italic">Sin titulares cargados</li>
        )}
      </ul>
      {suplentes.length > 0 && (
        <>
          <p className="text-[10px] font-semibold text-zinc-500 uppercase mb-1">Suplentes</p>
          <ul className="space-y-1">
            {suplentes.map((lineup) => (
              <li key={lineup.id} className="text-xs text-zinc-400 truncate">
                {lineup.shirt_number ? `#${lineup.shirt_number} ` : ''}{lineup.player_name}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function EventsTimeline({ events, match }) {
  if (!events.length) {
    return (
      <div className="bg-surface-900 rounded-xl border border-surface-800 p-4">
        <p className="text-sm text-zinc-500 text-center py-6">Todavia no hay eventos cargados.</p>
      </div>
    )
  }

  const ordered = [...events].sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999))

  return (
    <div className="bg-surface-900 rounded-xl border border-surface-800 overflow-hidden">
      {ordered.map((event) => {
        const isHome = event.team_id === match.home_team_id
        const teamName = isHome
          ? (match.home_team_short_name ?? match.home_team_name)
          : (match.away_team_short_name ?? match.away_team_name)
        return (
          <div key={event.id} className="flex items-center gap-3 px-4 py-3 border-b border-surface-800 last:border-0">
            <div className="w-10 text-center text-xs font-bold text-zinc-400 tabular-nums">
              {event.minute != null ? `${event.minute}'` : '-'}
            </div>
            <div className={`w-1.5 h-8 rounded-full ${isHome ? 'bg-primary' : 'bg-zinc-500'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-100 truncate">
                {event.player_name || 'Jugador sin nombre'}
              </p>
              <p className="text-xs text-zinc-500">
                {EVENT_LABEL[event.event_type] ?? event.event_type} · {teamName}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function MatchDetail() {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState('info')

  const { data, isLoading } = useMatch(matchId)
  const match = data?.match
  const events = data?.events ?? []
  const { data: lineups = [] } = useMatchLineups(matchId)

  if (isLoading) return <Spinner className="py-20" />
  if (!match) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-zinc-500 text-sm mb-3">No se encontro el partido.</p>
        <button onClick={() => navigate(-1)} className="text-primary text-sm hover:underline">Volver</button>
      </div>
    )
  }

  const finalizado = match.status === 'finished'
  const enVivo = match.status === 'in_progress'

  return (
    <div>
      <div className="bg-gradient-to-br from-surface-900 to-surface-800 px-4 py-6">
        <button onClick={() => navigate(-1)} className="text-primary text-sm font-medium mb-4 inline-flex items-center gap-1 hover:underline">
          Volver
        </button>

        <div className="flex items-center justify-center gap-2 mb-3">
          <Badge variant={enVivo ? 'live' : finalizado ? 'success' : 'default'}>
            {labelStatus(match.status)}
          </Badge>
          {match.round != null && <span className="text-xs text-zinc-500">Fecha {match.round}</span>}
        </div>

        <div className="flex items-center gap-3 max-w-md mx-auto">
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/equipo/${match.home_team_id}`)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') navigate(`/equipo/${match.home_team_id}`)
            }}
            className="flex-1 flex flex-col items-center gap-2 min-w-0"
          >
            <div className="relative">
              <TeamLogo logoUrl={match.home_team_logo_url} name={match.home_team_name} color={match.home_primary_color} size="lg" className="border-2 border-white/20" />
              <FavoriteButton teamId={match.home_team_id} className="absolute -right-3 -top-3 bg-surface-950/90 border border-surface-700 p-1.5" />
            </div>
            <span className="text-white font-bold text-sm text-center leading-tight">
              {match.home_team_short_name ?? match.home_team_name}
            </span>
          </div>

          <div className="text-center min-w-[5rem]">
            {finalizado || enVivo ? (
              <span className="text-white text-4xl font-extrabold tabular-nums tracking-tight">
                {match.home_score} <span className="opacity-40">-</span> {match.away_score}
              </span>
            ) : match.scheduled_at ? (
              <div>
                <p className="text-white text-2xl font-extrabold leading-none">{formatHora(match.scheduled_at)}</p>
                <p className="text-white/70 text-[10px] mt-1 uppercase tracking-wide">Inicio</p>
              </div>
            ) : (
              <p className="text-white/70 text-xs uppercase tracking-wide">Sin horario</p>
            )}
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/equipo/${match.away_team_id}`)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') navigate(`/equipo/${match.away_team_id}`)
            }}
            className="flex-1 flex flex-col items-center gap-2 min-w-0"
          >
            <div className="relative">
              <TeamLogo logoUrl={match.away_team_logo_url} name={match.away_team_name} color={match.away_primary_color} size="lg" className="border-2 border-white/20" />
              <FavoriteButton teamId={match.away_team_id} className="absolute -right-3 -top-3 bg-surface-950/90 border border-surface-700 p-1.5" />
            </div>
            <span className="text-white font-bold text-sm text-center leading-tight">
              {match.away_team_short_name ?? match.away_team_name}
            </span>
          </div>
        </div>

        {match.mvp_player_name && (
          <div className="mt-4 mx-auto max-w-md bg-amber-500/20 border border-amber-300/30 rounded-xl px-3 py-2 flex items-center gap-2">
            <span className="text-base">★</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-amber-200 font-semibold uppercase tracking-wide leading-none mb-0.5">MVP del partido</p>
              <p className="text-sm font-bold text-white truncate">{match.mvp_player_name}</p>
            </div>
          </div>
        )}
      </div>

      <div className="sticky top-12 z-30 bg-surface-950/95 backdrop-blur border-b border-surface-800">
        <div className="px-3 flex gap-1">
          {TABS.map((item) => (
            <button key={item.key} onClick={() => setTab(item.key)}
              className={`flex-1 px-3 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
                tab === item.key ? 'border-primary text-primary' : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 py-4 space-y-4 pb-28">
        {tab === 'info' && (
          <div className="bg-surface-900 rounded-xl border border-surface-800 p-4">
            <h2 className="font-bold text-sm mb-3 text-zinc-100">Info del partido</h2>
            <div className="space-y-1.5 text-sm text-zinc-300">
              {match.scheduled_at && (
                <p>{formatFechaLarga(match.scheduled_at)} · {formatHora(match.scheduled_at)}</p>
              )}
              {!match.scheduled_at && <p>Dia y horario a definir</p>}
              {match.venue_name && <p>{match.venue_name}{match.venue_address ? ` · ${match.venue_address}` : ''}</p>}
              {match.referee_name && <p>Arbitro: {match.referee_name}</p>}
              <p>{match.league_name}{match.season ? ` · ${match.season}` : ''}</p>
            </div>
          </div>
        )}

        {tab === 'eventos' && <EventsTimeline events={events} match={match} />}

        {tab === 'formacion' && (
          lineups.length === 0 ? (
            <div className="bg-surface-900 rounded-xl border border-surface-800 p-4">
              <p className="text-sm text-zinc-500 text-center py-6">Aun no se cargo la formacion.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <LineupColumn
                title={match.home_team_short_name ?? match.home_team_name}
                lineups={lineups.filter((lineup) => lineup.team_id === match.home_team_id)} />
              <LineupColumn
                title={match.away_team_short_name ?? match.away_team_name}
                lineups={lineups.filter((lineup) => lineup.team_id === match.away_team_id)} />
            </div>
          )
        )}
      </div>
    </div>
  )
}
