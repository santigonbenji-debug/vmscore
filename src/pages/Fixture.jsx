import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { toZonedTime } from 'date-fns-tz'
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subDays,
} from 'date-fns'
import { es } from 'date-fns/locale'
import FavoriteButton from '../components/teams/FavoriteButton'
import TeamLogo from '../components/teams/TeamLogo'
import Spinner from '../components/ui/Spinner'

const TZ = 'America/Argentina/San_Luis'

function zonedNow() {
  return toZonedTime(new Date(), TZ)
}

function dayKey(date) {
  return format(date, 'yyyy-MM-dd')
}

function useAllMatches() {
  return useQuery({
    queryKey: ['matches-all-with-external'],
    queryFn: async () => {
      const [{ data: official, error: officialError }, { data: external, error: externalError }] = await Promise.all([
        supabase.from('v_matches').select('*').order('scheduled_at', { ascending: true }),
        supabase.from('v_external_matches_public').select('*').order('round', { ascending: true }),
      ])

      if (officialError) throw officialError
      if (externalError) throw externalError

      const officialRows = (official ?? []).map((match) => ({
        ...match,
        app_id: `official-${match.id}`,
        source_kind: 'official',
      }))

      const externalRows = (external ?? []).map((match) => ({
        ...match,
        id: `external-${match.archive_id}`,
        app_id: `external-${match.archive_id}`,
        source_kind: 'external',
      }))

      return [...officialRows, ...externalRows]
    },
  })
}

function MatchRow({ p, onClick }) {
  const finalizado = p.status === 'finished'
  const enVivo = p.status === 'in_progress'
  const externalPending = p.source_kind === 'external' && p.review_status !== 'confirmed'
  const hora = p.scheduled_at
    ? format(toZonedTime(new Date(p.scheduled_at), TZ), 'HH:mm')
    : 'A def.'
  const homeWon = finalizado && p.home_score > p.away_score
  const awayWon = finalizado && p.away_score > p.home_score
  const clickable = Boolean(onClick)

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (clickable && (event.key === 'Enter' || event.key === ' ')) onClick()
      }}
      className={`flex items-center gap-2 px-3 py-2.5 border-b border-surface-800 last:border-0 transition-colors ${
        clickable ? 'cursor-pointer hover:bg-surface-800/60' : ''
      }`}
    >
      <div className="w-12 shrink-0 text-center">
        {enVivo ? (
          <span className="text-emerald-400 text-[11px] font-bold tracking-wide animate-pulse">VIVO</span>
        ) : finalizado ? (
          <span className="text-[11px] text-zinc-500 font-semibold">FT</span>
        ) : (
          <span className="text-xs text-zinc-300 font-medium">{hora}</span>
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <FavoriteButton teamId={p.home_team_id} className="-ml-1 p-1" />
          <TeamLogo logoUrl={p.home_team_logo_url} name={p.home_team_name} color={p.home_primary_color} />
          <span className={`text-sm flex-1 truncate ${homeWon ? 'font-bold text-zinc-100' : finalizado ? 'text-zinc-500' : 'font-medium text-zinc-200'}`}>
            {p.home_team_short_name ?? p.home_team_name}
          </span>
          {(finalizado || enVivo) && (
            <span className={`text-sm font-bold tabular-nums shrink-0 ${homeWon ? 'text-zinc-100' : finalizado ? 'text-zinc-500' : 'text-emerald-400'}`}>
              {p.home_score}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <FavoriteButton teamId={p.away_team_id} className="-ml-1 p-1" />
          <TeamLogo logoUrl={p.away_team_logo_url} name={p.away_team_name} color={p.away_primary_color} />
          <span className={`text-sm flex-1 truncate ${awayWon ? 'font-bold text-zinc-100' : finalizado ? 'text-zinc-500' : 'font-medium text-zinc-200'}`}>
            {p.away_team_short_name ?? p.away_team_name}
          </span>
          {(finalizado || enVivo) && (
            <span className={`text-sm font-bold tabular-nums shrink-0 ${awayWon ? 'text-zinc-100' : finalizado ? 'text-zinc-500' : 'text-emerald-400'}`}>
              {p.away_score}
            </span>
          )}
        </div>
      </div>

      {externalPending ? (
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
          Pendiente
        </span>
      ) : p.source_kind === 'external' ? (
        <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-300">
          Histórico
        </span>
      ) : clickable ? (
        <svg className="w-4 h-4 text-zinc-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      ) : null}
    </div>
  )
}

function CalendarModal({ open, onClose, selectedDay, onChange }) {
  const [cursor, setCursor] = useState(() => new Date(`${selectedDay}T12:00:00`))

  const days = useMemo(() => {
    const ini = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
    const fin = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 })
    return eachDayOfInterval({ start: ini, end: fin })
  }, [cursor])

  if (!open) return null

  const selectedDate = new Date(`${selectedDay}T12:00:00`)

  function pick(date) {
    onChange(dayKey(date))
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-900 border border-surface-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800 sticky top-0 bg-surface-900">
          <p className="font-bold text-sm text-zinc-100">Elegir día</p>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 text-xl leading-none">×</button>
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => setCursor(addMonths(cursor, -1))} className="h-9 w-9 rounded-lg hover:bg-surface-800 text-zinc-300">
              ‹
            </button>
            <p className="font-semibold text-sm text-zinc-100 capitalize">
              {format(cursor, 'MMMM yyyy', { locale: es })}
            </p>
            <button type="button" onClick={() => setCursor(addMonths(cursor, 1))} className="h-9 w-9 rounded-lg hover:bg-surface-800 text-zinc-300">
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
              <div key={d} className="text-[10px] uppercase text-center text-zinc-500 py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((date) => {
              const inMonth = isSameMonth(date, cursor)
              const selected = isSameDay(date, selectedDate)
              const today = isSameDay(date, zonedNow())
              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  onClick={() => pick(date)}
                  className={`aspect-square rounded-lg text-xs font-semibold transition-colors ${
                    selected
                      ? 'bg-primary text-white'
                      : inMonth
                        ? 'text-zinc-200 hover:bg-surface-800'
                        : 'text-zinc-600 hover:bg-surface-800/50'
                  } ${!selected && today ? 'border border-primary/60' : ''}`}
                >
                  {format(date, 'd')}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function DayStrip({ selectedDay, onChange, onOpenCalendar }) {
  const selectedDate = new Date(`${selectedDay}T12:00:00`)
  const days = Array.from({ length: 7 }, (_, index) => addDays(subDays(selectedDate, 3), index))

  return (
    <div className="rounded-xl border border-surface-800 bg-surface-900 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onChange(dayKey(subDays(selectedDate, 1)))}
          className="h-9 w-9 rounded-lg bg-surface-800 text-zinc-300 hover:bg-surface-700"
          aria-label="Día anterior"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={onOpenCalendar}
          className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-surface-800 px-3 py-2 text-xs font-bold capitalize text-zinc-100 hover:bg-surface-700"
        >
          <svg className="h-4 w-4 shrink-0 text-primary" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
        </button>
        <button
          type="button"
          onClick={() => onChange(dayKey(addDays(selectedDate, 1)))}
          className="h-9 w-9 rounded-lg bg-surface-800 text-zinc-300 hover:bg-surface-700"
          aria-label="Día siguiente"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {days.map((date) => {
          const key = dayKey(date)
          const selected = key === selectedDay
          const today = isSameDay(date, zonedNow())
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={`min-w-0 rounded-lg border px-1 py-1.5 text-center transition-colors ${
                selected
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface-950 text-zinc-300 border-surface-800 hover:bg-surface-800'
              }`}
            >
              <p className="truncate text-[9px] uppercase leading-none opacity-75">
                {today ? 'Hoy' : format(date, 'EEE', { locale: es })}
              </p>
              <p className="mt-1 text-sm font-extrabold leading-none">{format(date, 'd')}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const STATUS_TABS = [
  { key: 'all', label: 'Todos' },
  { key: 'live', label: 'En vivo' },
  { key: 'scheduled', label: 'Próximos' },
  { key: 'finished', label: 'Finalizados' },
  { key: 'tbd', label: 'A definir' },
]

export default function Fixture() {
  const navigate = useNavigate()
  const { data: partidos = [], isLoading } = useAllMatches()
  const [tab, setTab] = useState('all')
  const [selectedDay, setSelectedDay] = useState(() => dayKey(zonedNow()))
  const [calOpen, setCalOpen] = useState(false)

  const datedMatches = useMemo(() => partidos.filter((p) => p.scheduled_at), [partidos])
  const tbdMatches = useMemo(() => partidos.filter((p) => !p.scheduled_at), [partidos])

  const dayMatches = useMemo(() => (
    datedMatches.filter((p) => dayKey(toZonedTime(new Date(p.scheduled_at), TZ)) === selectedDay)
  ), [datedMatches, selectedDay])

  const visibleMatches = useMemo(() => {
    if (tab === 'tbd') return tbdMatches
    if (tab === 'live') return dayMatches.filter((p) => p.status === 'in_progress')
    if (tab === 'scheduled') return dayMatches.filter((p) => p.status === 'scheduled')
    if (tab === 'finished') return dayMatches.filter((p) => p.status === 'finished')
    return dayMatches
  }, [dayMatches, tab, tbdMatches])

  const groups = useMemo(() => {
    const out = {}
    for (const p of visibleMatches) {
      const groupKey = tab === 'tbd'
        ? `${p.league_id ?? 'sin-liga'}-${p.round ?? 'sin-fecha'}`
        : `${p.league_id ?? 'sin-liga'}`
      if (!out[groupKey]) {
        out[groupKey] = {
          id: groupKey,
          nombre: p.league_name ?? 'Sin liga',
          icono: p.sport_icon,
          genero: p.gender,
          round: tab === 'tbd' ? p.round : null,
          partidos: [],
        }
      }
      out[groupKey].partidos.push(p)
    }
    return Object.values(out).sort((a, b) => {
      if (tab === 'tbd' && a.round !== b.round) return Number(a.round ?? 999) - Number(b.round ?? 999)
      return a.nombre.localeCompare(b.nombre)
    })
  }, [tab, visibleMatches])

  const counts = useMemo(() => ({
    all: dayMatches.length,
    live: dayMatches.filter((p) => p.status === 'in_progress').length,
    scheduled: dayMatches.filter((p) => p.status === 'scheduled').length,
    finished: dayMatches.filter((p) => p.status === 'finished').length,
    tbd: tbdMatches.length,
  }), [dayMatches, tbdMatches])

  return (
    <div className="flex flex-col">
      <div className="px-3 py-3 space-y-3 pb-28">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-extrabold text-zinc-100">Fixture</h1>
            <p className="text-xs text-zinc-500">
              {tab === 'tbd'
                ? 'Partidos pendientes de fecha y horario'
                : 'Partidos por día'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedDay(dayKey(zonedNow()))
              if (tab === 'tbd') setTab('all')
            }}
            className="rounded-full bg-surface-900 border border-surface-800 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-surface-800"
          >
            Hoy
          </button>
        </div>

        {tab !== 'tbd' && (
          <DayStrip selectedDay={selectedDay} onChange={setSelectedDay} onOpenCalendar={() => setCalOpen(true)} />
        )}

        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3 scrollbar-none">
          {STATUS_TABS.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                tab === item.key
                  ? 'bg-primary text-white'
                  : 'bg-surface-800 text-zinc-400 hover:bg-surface-700 hover:text-zinc-200'
              }`}
            >
              {item.label}
              {counts[item.key] > 0 && (
                <span className={`ml-1.5 ${tab === item.key ? 'opacity-80' : 'opacity-60'}`}>
                  {counts[item.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {isLoading && <Spinner className="py-12" />}

        {!isLoading && visibleMatches.length === 0 && (
          <div className="text-center py-16 text-zinc-500">
            <p className="text-3xl mb-2">📅</p>
            <p className="font-medium text-sm">
              {tab === 'tbd' ? 'No hay partidos a definir' : 'No hay partidos para este día'}
            </p>
            <p className="text-xs text-zinc-600 mt-1">
              {tab === 'tbd' ? 'Los pendientes aparecerán acá' : 'Probá moverte a otro día del calendario'}
            </p>
          </div>
        )}

        {groups.map((group) => (
          <section key={group.id} className="bg-surface-900 rounded-xl border border-surface-800 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-800 bg-surface-800/40">
              {group.icono && <span className="text-sm">{group.icono}</span>}
              <p className="font-bold text-xs truncate flex-1 text-zinc-100">{group.nombre}</p>
              {group.round && (
                <p className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                  Fecha {group.round}
                </p>
              )}
              {group.genero && (
                <p className="text-[10px] text-zinc-500 capitalize shrink-0">{group.genero}</p>
              )}
            </div>
            {group.partidos.map((p) => (
              <MatchRow
                key={p.app_id}
                p={p}
                onClick={p.source_kind === 'official' ? () => navigate(`/partido/${p.id}`) : undefined}
              />
            ))}
          </section>
        ))}
      </div>

      <CalendarModal
        open={calOpen}
        onClose={() => setCalOpen(false)}
        selectedDay={selectedDay}
        onChange={setSelectedDay}
      />
    </div>
  )
}
