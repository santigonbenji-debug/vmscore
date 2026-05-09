import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { toZonedTime } from 'date-fns-tz'
import {
  format, addMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay,
} from 'date-fns'
import { es } from 'date-fns/locale'
import FavoriteButton from '../components/teams/FavoriteButton'
import TeamLogo from '../components/teams/TeamLogo'
import Spinner from '../components/ui/Spinner'

const TZ = 'America/Argentina/San_Luis'

function useAllMatches() {
  return useQuery({
    queryKey: ['matches-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_matches')
        .select('*')
        .order('scheduled_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })
}

function MatchRow({ p, onClick }) {
  const finalizado = p.status === 'finished'
  const enVivo     = p.status === 'in_progress'
  const hora       = format(toZonedTime(new Date(p.scheduled_at), TZ), 'HH:mm')
  const homeWon = finalizado && p.home_score > p.away_score
  const awayWon = finalizado && p.away_score > p.home_score

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
      <svg className="w-4 h-4 text-zinc-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </div>
  )
}

// Calendario multi-seleccion: el usuario marca dias y se filtran los partidos por esos dias
function CalendarFilter({ open, onClose, selectedDays, onChange }) {
  const [cursor, setCursor] = useState(() => {
    const z = toZonedTime(new Date(), TZ)
    return new Date(z.getFullYear(), z.getMonth(), 1)
  })

  const days = useMemo(() => {
    const ini = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
    const fin = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 })
    return eachDayOfInterval({ start: ini, end: fin })
  }, [cursor])

  if (!open) return null

  const hoy = toZonedTime(new Date(), TZ)
  const isSelected = (d) =>
    selectedDays.some((s) => isSameDay(new Date(s), d))

  function toggle(d) {
    const key = format(d, 'yyyy-MM-dd')
    const ya = selectedDays.includes(key)
    onChange(ya ? selectedDays.filter((k) => k !== key) : [...selectedDays, key])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-surface-900 border border-surface-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800 sticky top-0 bg-surface-900">
          <p className="font-bold text-sm text-zinc-100">Filtrar por dias</p>
          <button onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 text-xl leading-none">×</button>
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => setCursor(addMonths(cursor, -1))}
              className="px-2 py-1 rounded hover:bg-surface-800 text-zinc-300">‹</button>
            <p className="font-semibold text-sm text-zinc-100 capitalize">
              {format(cursor, 'MMMM yyyy', { locale: es })}
            </p>
            <button type="button" onClick={() => setCursor(addMonths(cursor, 1))}
              className="px-2 py-1 rounded hover:bg-surface-800 text-zinc-300">›</button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
              <div key={d} className="text-[10px] uppercase text-center text-zinc-500 py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const inMonth = isSameMonth(d, cursor)
              const sel     = isSelected(format(d, 'yyyy-MM-dd'))
              const esHoy   = isSameDay(d, hoy)
              return (
                <button key={d.toISOString()} type="button" onClick={() => toggle(d)}
                  className={`aspect-square rounded-lg text-xs font-semibold transition-colors
                    ${sel
                      ? 'bg-primary text-white'
                      : inMonth
                        ? 'text-zinc-200 hover:bg-surface-800'
                        : 'text-zinc-600 hover:bg-surface-800/50'}
                    ${!sel && esHoy ? 'border border-primary/60' : ''}`}>
                  {format(d, 'd')}
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-surface-800">
            <button type="button" onClick={() => onChange([])}
              className="text-xs text-zinc-400 hover:text-zinc-100">Limpiar</button>
            <button type="button" onClick={onClose}
              className="bg-primary text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-primary-600">
              Aplicar ({selectedDays.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const STATUS_TABS = [
  { key: 'all',       label: 'Todos' },
  { key: 'live',      label: 'En vivo' },
  { key: 'scheduled', label: 'Próximos' },
  { key: 'finished',  label: 'Finalizados' },
]

export default function Fixture() {
  const navigate = useNavigate()
  const { data: partidos = [], isLoading } = useAllMatches()
  const [tab, setTab]     = useState('all')
  const [selDays, setSelDays] = useState([]) // ['yyyy-MM-dd', ...]
  const [calOpen, setCalOpen] = useState(false)

  // Filtro por estado + por dias seleccionados
  const filtrados = useMemo(() => {
    let arr = partidos
    if (tab === 'live')      arr = arr.filter((p) => p.status === 'in_progress')
    else if (tab === 'scheduled') arr = arr.filter((p) => p.status === 'scheduled')
    else if (tab === 'finished')  arr = arr.filter((p) => p.status === 'finished')
    if (selDays.length > 0) {
      arr = arr.filter((p) => {
        const f = format(toZonedTime(new Date(p.scheduled_at), TZ), 'yyyy-MM-dd')
        return selDays.includes(f)
      })
    }
    return arr
  }, [partidos, tab, selDays])

  // Agrupar por fecha → por liga
  const porFecha = useMemo(() => {
    const out = {}
    for (const p of filtrados) {
      const dz = toZonedTime(new Date(p.scheduled_at), TZ)
      const fkey = format(dz, 'yyyy-MM-dd')
      if (!out[fkey]) out[fkey] = {}
      const lkey = p.league_id ?? 'sin-liga'
      if (!out[fkey][lkey]) out[fkey][lkey] = {
        ligaId: p.league_id, nombre: p.league_name, icono: p.sport_icon,
        genero: p.gender, partidos: [],
      }
      out[fkey][lkey].partidos.push(p)
    }
    return out
  }, [filtrados])

  const fechas = Object.keys(porFecha).sort()

  const counts = useMemo(() => ({
    all:       partidos.length,
    live:      partidos.filter((p) => p.status === 'in_progress').length,
    scheduled: partidos.filter((p) => p.status === 'scheduled').length,
    finished:  partidos.filter((p) => p.status === 'finished').length,
  }), [partidos])

  return (
    <div className="flex flex-col">
      <div className="px-3 py-3 space-y-3 pb-28">
        {/* Header con filtro */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-extrabold text-zinc-100">Fixture</h1>
            <p className="text-xs text-zinc-500">
              {filtrados.length} partido{filtrados.length === 1 ? '' : 's'}
              {selDays.length > 0 ? ` · ${selDays.length} día${selDays.length === 1 ? '' : 's'} seleccionado${selDays.length === 1 ? '' : 's'}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selDays.length > 0 && (
              <button onClick={() => setSelDays([])}
                className="text-xs text-zinc-400 hover:text-zinc-100 px-2 py-1.5 rounded-full">
                Limpiar
              </button>
            )}
            <button onClick={() => setCalOpen(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors
                ${selDays.length > 0
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface-900 text-zinc-200 border-surface-700 hover:bg-surface-800'}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Filtrar
              {selDays.length > 0 && <span className="opacity-90">· {selDays.length}</span>}
            </button>
          </div>
        </div>

        {/* Tabs por estado */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-3 px-3 scrollbar-none">
          {STATUS_TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors
                ${tab === t.key
                  ? 'bg-primary text-white'
                  : 'bg-surface-800 text-zinc-400 hover:bg-surface-700 hover:text-zinc-200'}`}>
              {t.label}
              {counts[t.key] > 0 && (
                <span className={`ml-1.5 ${tab === t.key ? 'opacity-80' : 'opacity-60'}`}>
                  {counts[t.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {isLoading && <Spinner className="py-12" />}

        {!isLoading && filtrados.length === 0 && (
          <div className="text-center py-16 text-zinc-500">
            <p className="text-3xl mb-2">📅</p>
            <p className="font-medium text-sm">
              {selDays.length > 0
                ? 'No hay partidos en los días seleccionados'
                : 'No hay partidos con este filtro'}
            </p>
            <p className="text-xs text-zinc-600 mt-1">
              {selDays.length > 0 ? 'Probá quitar el filtro de días' : 'Probá otro estado'}
            </p>
          </div>
        )}

        {/* Partidos agrupados por fecha → por liga */}
        {fechas.map((f) => {
          const fechaDate = new Date(f + 'T12:00:00')
          return (
            <section key={f}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="bg-primary text-white rounded-lg px-2.5 py-1 shrink-0 text-center min-w-[2.5rem]">
                  <p className="text-[10px] font-bold uppercase leading-none opacity-90">
                    {format(fechaDate, 'MMM', { locale: es })}
                  </p>
                  <p className="text-lg font-extrabold leading-tight">{format(fechaDate, 'd')}</p>
                </div>
                <p className="font-bold text-sm capitalize text-zinc-100">
                  {format(fechaDate, "EEEE d 'de' MMMM", { locale: es })}
                </p>
              </div>
              {Object.entries(porFecha[f]).map(([lid, liga]) => (
                <div key={lid} className="mb-3 bg-surface-900 rounded-xl border border-surface-800 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-800 bg-surface-800/40">
                    {liga.icono && <span className="text-sm">{liga.icono}</span>}
                    <p className="font-bold text-xs truncate flex-1 text-zinc-100">{liga.nombre ?? 'Sin liga'}</p>
                    {liga.genero && (
                      <p className="text-[10px] text-zinc-500 capitalize shrink-0">{liga.genero}</p>
                    )}
                  </div>
                  {liga.partidos.map((p) => (
                    <MatchRow key={p.id} p={p} onClick={() => navigate(`/partido/${p.id}`)} />
                  ))}
                </div>
              ))}
            </section>
          )
        })}
      </div>

      <CalendarFilter
        open={calOpen}
        onClose={() => setCalOpen(false)}
        selectedDays={selDays}
        onChange={setSelDays}
      />
    </div>
  )
}
