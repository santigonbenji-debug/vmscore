import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMatch } from '../hooks/useMatches'
import { useTeamRecentMatches } from '../hooks/useMatches'
import { useMatchLineups } from '../hooks/useLineups'
import { useLiveSyncEvents, useMatchLiveLink } from '../hooks/useLiveSync'
import { useNow } from '../hooks/useNow'
import { ArrowLeft, CalendarDays, Clock3, MapPin, Trophy, UserRound } from 'lucide-react'
import FavoriteButton from '../components/teams/FavoriteButton'
import TeamLogo from '../components/teams/TeamLogo'
import RecentForm from '../components/matches/RecentForm'
import Spinner from '../components/ui/Spinner'
import Badge from '../components/ui/Badge'
import { formatFechaLarga, formatHora, isLocosHalftime, locosMinuteLabel, matchStartedByClock, matchStatusDetail } from '../lib/helpers'

const TABS = [
  { key: 'info', label: 'Info' },
  { key: 'eventos', label: 'Eventos' },
  { key: 'formacion', label: 'Convocados' },
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

const GOAL_EVENT_TYPES = new Set(['goal', 'own_goal', 'penalty_goal'])

function teamDisplayName(shortName, name) {
  return shortName?.trim() || name?.trim() || 'Equipo'
}

function InfoRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <p><span className="text-zinc-500">{label}:</span> {children}</p>
    </div>
  )
}

function LineupColumn({ title, lineups }) {
  return (
    <div className="bg-surface-900 rounded-xl border border-surface-800 p-3">
      <p className="text-xs font-semibold text-zinc-400 uppercase mb-2">{title}</p>
      <ul className="space-y-1">
        {lineups.map((lineup) => (
          <li key={lineup.id} className="text-sm text-zinc-100 flex justify-between gap-2">
            <span className="truncate">{lineup.shirt_number ? `#${lineup.shirt_number} ` : ''}{lineup.player_name}</span>
            {lineup.position && <span className="text-xs text-zinc-500 shrink-0">{lineup.position}</span>}
          </li>
        ))}
        {lineups.length === 0 && (
          <li className="text-xs text-zinc-500 italic">Sin convocados cargados</li>
        )}
      </ul>
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
          ? teamDisplayName(match.home_team_short_name, match.home_team_name)
          : teamDisplayName(match.away_team_short_name, match.away_team_name)
        const logoUrl = isHome ? match.home_team_logo_url : match.away_team_logo_url
        const color = isHome ? match.home_primary_color : match.away_primary_color
        const isGoalEvent = GOAL_EVENT_TYPES.has(event.event_type)
        const eventTitle = isGoalEvent
          ? 'Gol'
          : (event.player_name || 'Jugador sin nombre')
        return (
          <div key={event.id} className="flex items-center gap-3 px-4 py-3 border-b border-surface-800 last:border-0">
            <div className="w-10 text-center text-xs font-bold text-zinc-400 tabular-nums">
              {event.minute != null ? `${event.minute}'` : '-'}
            </div>
            {isGoalEvent ? (
              <TeamLogo logoUrl={logoUrl} name={teamName} color={color} />
            ) : (
              <div className={`w-1.5 h-8 rounded-full ${isHome ? 'bg-primary' : 'bg-zinc-500'}`} />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-100 truncate">
                {eventTitle}
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
  const now = useNow()

  const { data, isLoading } = useMatch(matchId)
  const match = data?.match
  const events = data?.events ?? []
  const { data: lineups = [] } = useMatchLineups(matchId)
  const { data: liveLink } = useMatchLiveLink(matchId, 'any')
  const { data: liveEvents = [] } = useLiveSyncEvents(matchId)
  const { data: homeMatches = [] } = useTeamRecentMatches(match?.home_team_id, 6)
  const { data: awayMatches = [] } = useTeamRecentMatches(match?.away_team_id, 6)

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
  const finalPrimeraParte = isLocosHalftime(liveLink)
  const enVivo = !finalPrimeraParte && (match.status === 'in_progress' || (
    match.status === 'scheduled' && matchStartedByClock(match, now)
  ))
  const visibleLiveEvents = liveEvents.filter((event) => event.status !== 'dismissed')
  const hasLiveState = liveLink?.last_synced_at && ['in_progress', 'paused', 'finished'].includes(liveLink?.last_status)

  return (
    <div>
      <div className="relative overflow-hidden border-b border-white/5 bg-[#121416] px-4 py-6">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2 opacity-[0.12] blur-3xl" style={{ backgroundColor: match.home_primary_color ?? '#64748b' }} />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-[0.10] blur-3xl" style={{ backgroundColor: match.away_primary_color ?? '#64748b' }} />
        <div className="pointer-events-none absolute inset-0 bg-black/50 backdrop-blur-[3px]" />
        <button onClick={() => navigate(-1)} className="relative mb-4 inline-flex items-center gap-1 text-sm font-medium text-zinc-100 hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> Volver
        </button>

        <div className="relative flex items-center justify-center gap-2 mb-3">
          <Badge variant={enVivo ? 'live' : finalizado ? 'success' : 'default'}>
            {finalPrimeraParte ? 'Final 1T' : enVivo ? 'En vivo' : matchStatusDetail(match)}
          </Badge>
          {match.round != null && <span className="text-xs text-zinc-500">Fecha {match.round}</span>}
        </div>

        <div className="relative flex items-center gap-3 max-w-md mx-auto">
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
              {teamDisplayName(match.home_team_short_name, match.home_team_name)}
            </span>
          </div>

          <div className="text-center min-w-[5rem]">
            {finalizado || enVivo || finalPrimeraParte ? (
              <span className="text-white text-4xl font-extrabold tabular-nums tracking-tight">
                {match.home_score ?? 0} <span className="opacity-40">-</span> {match.away_score ?? 0}
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
              {teamDisplayName(match.away_team_short_name, match.away_team_name)}
            </span>
          </div>
        </div>

        {match.mvp_player_name && (
          <div className="relative mt-4 mx-auto max-w-md bg-amber-500/20 border border-amber-300/30 rounded-xl px-3 py-2 flex items-center gap-2">
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
        {tab === 'info' && hasLiveState && (
          <div className="bg-surface-900 rounded-xl border border-primary/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-primary uppercase tracking-wide">Marcador en vivo</p>
                <p className="text-2xl font-extrabold text-zinc-100 mt-1">
                  {liveLink.last_home_score ?? '-'} - {liveLink.last_away_score ?? '-'}
                </p>
              </div>
              <div className="text-right">
                <Badge variant={liveLink.last_status === 'in_progress' ? 'live' : liveLink.last_status === 'finished' ? 'success' : 'default'}>
                  {finalPrimeraParte ? 'Final 1T' : liveLink.last_status === 'in_progress' ? 'En vivo' : liveLink.last_status === 'finished' ? 'Finalizado' : 'Actualizado'}
                </Badge>
                <p className="text-xs text-zinc-500 mt-2">
                  {locosMinuteLabel(liveLink, now) ?? (liveLink.last_minute !== null && liveLink.last_minute !== undefined ? `${liveLink.last_minute}'` : 'Minuto a definir')}
                </p>
              </div>
            </div>
          </div>
        )}

        {tab === 'info' && (
          <div className="bg-surface-900 rounded-xl border border-surface-800 p-4">
            <h2 className="mb-3 text-xs font-black uppercase tracking-wide text-zinc-400">Forma reciente</h2>
            <div className="space-y-3">
              <RecentForm
                team={{
                  id: match.home_team_id,
                  name: teamDisplayName(match.home_team_short_name, match.home_team_name),
                  logoUrl: match.home_team_logo_url,
                  color: match.home_primary_color,
                }}
                matches={homeMatches}
                currentMatchId={match.id}
              />
              <RecentForm
                team={{
                  id: match.away_team_id,
                  name: teamDisplayName(match.away_team_short_name, match.away_team_name),
                  logoUrl: match.away_team_logo_url,
                  color: match.away_primary_color,
                }}
                matches={awayMatches}
                currentMatchId={match.id}
              />
            </div>
          </div>
        )}

        {tab === 'info' && (
          <div className="bg-surface-900 rounded-xl border border-surface-800 p-4">
            <h2 className="font-bold text-sm mb-3 text-zinc-100">Info del partido</h2>
            <div className="space-y-2 text-sm text-zinc-300">
              {match.scheduled_at && match.status !== 'postponed' && (
                <>
                  <InfoRow icon={CalendarDays} label="Fecha">{formatFechaLarga(match.scheduled_at)}</InfoRow>
                  <InfoRow icon={Clock3} label="Hora">{formatHora(match.scheduled_at)} hs</InfoRow>
                </>
              )}
              {(!match.scheduled_at || match.status === 'postponed') && (
                <InfoRow icon={CalendarDays} label="Fecha">{match.status === 'postponed' ? 'Nueva fecha a definir' : 'Dia y horario a definir'}</InfoRow>
              )}
              {match.venue_name && (
                <InfoRow icon={MapPin} label="Ubicacion">{match.venue_name}{match.venue_address ? ` · ${match.venue_address}` : ''}</InfoRow>
              )}
              {(match.home_technical_director || match.away_technical_director) && (
                <div className="flex items-start gap-2">
                  <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="space-y-0.5">
                    {match.home_technical_director && <p><span className="text-zinc-500">DT {teamDisplayName(match.home_team_short_name, match.home_team_name)}:</span> {match.home_technical_director}</p>}
                    {match.away_technical_director && <p><span className="text-zinc-500">DT {teamDisplayName(match.away_team_short_name, match.away_team_name)}:</span> {match.away_technical_director}</p>}
                  </div>
                </div>
              )}
              {match.referee_name && <InfoRow icon={UserRound} label="Arbitro">{match.referee_name}</InfoRow>}
              <InfoRow icon={Trophy} label="Competencia">{match.league_name}{match.season ? ` · ${match.season}` : ''}</InfoRow>
            </div>
          </div>
        )}

        {tab === 'eventos' && (
          <div className="space-y-4">
            {visibleLiveEvents.length > 0 && (
              <div className="bg-surface-900 rounded-xl border border-primary/25 overflow-hidden">
                <div className="px-4 py-3 border-b border-surface-800">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wide">Novedades en vivo</p>
                </div>
                {visibleLiveEvents.map((event) => {
                  const isHome = event.team_id === match.home_team_id
                  const liveTeamName = isHome
                    ? teamDisplayName(match.home_team_short_name, match.home_team_name)
                    : teamDisplayName(match.away_team_short_name, match.away_team_name)
                  const liveLogoUrl = isHome ? match.home_team_logo_url : match.away_team_logo_url
                  const liveColor = isHome ? match.home_primary_color : match.away_primary_color
                  const isGoal = GOAL_EVENT_TYPES.has(event.event_type)

                  return (
                    <div key={event.id} className="flex items-center gap-3 px-4 py-3 border-b border-surface-800 last:border-0">
                      <div className="w-10 text-center text-xs font-bold text-zinc-400 tabular-nums">
                        {event.minute != null ? `${event.minute}'` : '-'}
                      </div>
                      {isGoal ? (
                        <TeamLogo logoUrl={liveLogoUrl} name={liveTeamName} color={liveColor} />
                      ) : (
                        <div className="h-8 w-1.5 rounded-full bg-primary" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-zinc-100 truncate">
                          {isGoal ? (EVENT_LABEL[event.event_type] ?? 'Gol') : event.title}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {isGoal
                            ? liveTeamName
                            : event.event_type === 'start'
                              ? 'Partido en vivo'
                              : event.event_type === 'finish'
                                ? 'Partido finalizado'
                                : event.event_type === 'halftime'
                                  ? 'Entretiempo'
                                  : event.home_score !== null && event.home_score !== undefined && event.away_score !== null && event.away_score !== undefined
                              ? `${event.home_score} - ${event.away_score}`
                              : ''}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <EventsTimeline events={events} match={match} />
          </div>
        )}

        {tab === 'formacion' && (
          lineups.length === 0 ? (
            <div className="bg-surface-900 rounded-xl border border-surface-800 p-4">
              <p className="text-sm text-zinc-500 text-center py-6">Aun no se cargaron convocados.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <LineupColumn
                title={teamDisplayName(match.home_team_short_name, match.home_team_name)}
                lineups={lineups.filter((lineup) => lineup.team_id === match.home_team_id)} />
              <LineupColumn
                title={teamDisplayName(match.away_team_short_name, match.away_team_name)}
                lineups={lineups.filter((lineup) => lineup.team_id === match.away_team_id)} />
            </div>
          )
        )}
      </div>
    </div>
  )
}
