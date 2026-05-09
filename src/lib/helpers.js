import { format, isToday, isYesterday, isTomorrow } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { es } from 'date-fns/locale'

const TZ = 'America/Argentina/San_Luis'

export function toSanLuis(date) {
  return toZonedTime(new Date(date), TZ)
}

export function formatHora(date) {
  return format(toSanLuis(date), 'HH:mm')
}

export function formatFecha(date) {
  return format(toSanLuis(date), 'eee. d MMM.', { locale: es })
}

export function formatDiaRelativo(date) {
  const d = toSanLuis(date)
  if (isToday(d))     return 'Hoy'
  if (isYesterday(d)) return 'Ayer'
  if (isTomorrow(d))  return 'Mañana'
  return formatFecha(date)
}

export function formatFechaHora(date) {
  return `${formatDiaRelativo(date)} · ${formatHora(date)}`
}

export function formatFechaLarga(date) {
  return format(toSanLuis(date), "EEEE d 'de' MMMM 'de' yyyy", { locale: es })
}

export function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function colorStatus(status) {
  const map = {
    scheduled:   'bg-gray-100 text-gray-600',
    in_progress: 'bg-green-100 text-green-700',
    finished:    'bg-gray-200 text-gray-700',
    postponed:   'bg-yellow-100 text-yellow-700',
    cancelled:   'bg-red-100 text-red-700',
  }
  return map[status] ?? 'bg-gray-100 text-gray-600'
}

export function labelStatus(status) {
  const map = {
    scheduled:   'Programado',
    in_progress: 'En Vivo',
    finished:    'Finalizado',
    postponed:   'Postergado',
    cancelled:   'Cancelado',
  }
  return map[status] ?? status
}

export function labelGenero(gender) {
  const map = { masculino: 'Masculino', femenino: 'Femenino', mixto: 'Mixto' }
  return map[gender] ?? gender
}
// Convierte fecha UTC a string "yyyy-MM-dd'T'HH:mm" para input datetime-local
// (usa zona horaria de San Luis)
import { format as formatFn } from 'date-fns'
export function utcToInputLocal(utcStr) {
  if (!utcStr) return ''
  return formatFn(toSanLuis(utcStr), "yyyy-MM-dd'T'HH:mm")
}

// Label del tipo de evento de partido
export function labelEvento(type) {
  const map = {
    goal:           '⚽ Gol',
    own_goal:       '⚽ Gol en contra',
    penalty_goal:   '⚽ Penal',
    yellow_card:    '🟨 Amarilla',
    red_card:       '🟥 Roja',
    yellow_red_card:'🟥 Doble amarilla',
    substitution:   '🔄 Sustitución',
  }
  return map[type] ?? type
}
