const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/locos-por-el-futbol-vm/databases/(default)/documents'
const API_KEY = 'AIzaSyDLwg8vbP8NK5upYoxOmyp5WUdj-scV80I'

function fieldValue(field) {
  if (!field) return null
  if ('stringValue' in field) return field.stringValue
  if ('integerValue' in field) return Number(field.integerValue)
  if ('doubleValue' in field) return Number(field.doubleValue)
  if ('booleanValue' in field) return field.booleanValue
  if ('timestampValue' in field) return field.timestampValue
  if ('nullValue' in field) return null
  if ('arrayValue' in field) return (field.arrayValue.values ?? []).map(fieldValue)
  if ('mapValue' in field) {
    return Object.fromEntries(
      Object.entries(field.mapValue.fields ?? {}).map(([key, value]) => [key, fieldValue(value)])
    )
  }
  return null
}

function firestoreDocToObject(document) {
  if (!document) return null
  const id = document.name?.split('/').pop()
  const fields = Object.fromEntries(
    Object.entries(document.fields ?? {}).map(([key, value]) => [key, fieldValue(value)])
  )
  return { id, ...fields }
}

export function parseLocosVmMatchId(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''

  const decoded = decodeURIComponent(raw)
  const pathMatch = decoded.match(/(?:match|matches|watch|partido)[/=/:?&]+([A-Za-z0-9_-]{12,})/i)
  if (pathMatch) return pathMatch[1]

  const idMatch = decoded.match(/[A-Za-z0-9_-]{16,}/)
  return idMatch?.[0] ?? raw
}

async function fetchFirestorePath(path) {
  const url = `${FIRESTORE_BASE}/${path}?key=${API_KEY}`
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Locos VM respondio ${response.status}.`)
  }
  return response.json()
}

async function fetchFirestoreCollection(collection, pageSize = 100, maxPages = 5) {
  const rows = []
  let pageToken = ''

  for (let page = 0; page < maxPages; page += 1) {
    const token = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
    const url = `${FIRESTORE_BASE}/${collection}?pageSize=${pageSize}${token}&key=${API_KEY}`
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error(`Locos VM respondio ${response.status}.`)
    const payload = await response.json()
    rows.push(...(payload.documents ?? []).map(firestoreDocToObject).filter(Boolean))
    if (!payload.nextPageToken) break
    pageToken = payload.nextPageToken
  }

  return rows
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function titleCase(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
}

const ROUND_WORDS = {
  primera: 1,
  segunda: 2,
  tercera: 3,
  cuarta: 4,
  quinta: 5,
  sexta: 6,
  septima: 7,
  octava: 8,
  novena: 9,
  decima: 10,
}

function extractLocosRound(description) {
  const text = cleanText(description)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const afterFecha = text.match(/fecha\s*(\d{1,2})/)
  if (afterFecha) return Number(afterFecha[1])

  const beforeFecha = text.match(/(\d{1,2})(?:ra|da|ta|na|ma|va)?\s*fecha/)
  if (beforeFecha) return Number(beforeFecha[1])

  const wordFecha = text.match(/\b(primera|segunda|tercera|cuarta|quinta|sexta|septima|octava|novena|decima)\s+fecha\b/)
  if (wordFecha) return ROUND_WORDS[wordFecha[1]] ?? null

  return null
}

function extractLocosCategory(description) {
  const original = cleanText(description)
  if (!original) return 'Sin categoria'

  const normalized = original
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const division = normalized.match(/\b(\d{1,2})(?:ra|da|ta|na|ma|va)?\s*division\b/)
  if (division) return `${division[1]} division`

  const beforeSeparator = original.split(/\s+-\s+|\s+\/\s+/)[0]
  if (beforeSeparator && beforeSeparator.length <= 40) return titleCase(beforeSeparator)

  const known = normalized.match(/\b(reserva|senior|femenino|juveniles?|inferiores?)\b/)
  if (known) return titleCase(known[1])

  return 'Sin categoria'
}

function toLocosDateTime(match) {
  if (!match?.date) return null
  const time = match.time && /^\d{1,2}:\d{2}$/.test(String(match.time)) ? String(match.time) : '00:00'
  return `${match.date}T${time}:00`
}

function toLocosScheduledAt(match) {
  if (!match?.date) return null
  const time = match.time && /^\d{1,2}:\d{2}$/.test(String(match.time)) ? String(match.time) : '00:00'
  const normalizedTime = time.length === 4 ? `0${time}` : time
  const date = new Date(`${match.date}T${normalizedTime}:00-03:00`)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function statusLabel(status) {
  if (status === 'finished') return 'Finalizados'
  if (status === 'live') return 'En vivo'
  if (status === 'upcoming') return 'Programados'
  return status ? titleCase(status) : 'Sin estado'
}

function increment(map, key, data = {}) {
  const safeKey = key || 'Sin dato'
  if (!map.has(safeKey)) map.set(safeKey, { key: safeKey, count: 0 })
  const current = map.get(safeKey)
  current.count += 1
  Object.entries(data).forEach(([dataKey, value]) => {
    if (dataKey === 'round') current[dataKey] = value
    else if (typeof value === 'number') current[dataKey] = (current[dataKey] ?? 0) + value
    else if (value !== undefined && current[dataKey] == null) current[dataKey] = value
  })
  return current
}

function sortSummary(rows) {
  return [...rows].sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)))
}

export async function fetchLocosVmPublicSnapshot() {
  const [teams, matches, creditPlans] = await Promise.all([
    fetchFirestoreCollection('teams', 100, 4),
    fetchFirestoreCollection('matches', 100, 8),
    fetchFirestoreCollection('creditPlans', 50, 2),
  ])

  const activeCreditPlans = creditPlans.filter((plan) => plan.active === true)
  const finishedMatches = matches.filter((match) => match.status === 'finished')
  const liveMatches = matches.filter((match) => match.status === 'live')
  const upcomingMatches = matches.filter((match) => match.status === 'upcoming')
  const matchesWithStream = matches.filter((match) => match.streamUrl)
  const matchesWithVod = matches.filter((match) => match.vodUrl)
  const teamsById = new Map(teams.map((team) => [team.id, team]))
  const enrichedMatches = matches.map((match) => ({
    ...match,
    homeTeam: teamsById.get(match.homeTeamId),
    awayTeam: teamsById.get(match.awayTeamId),
    category: extractLocosCategory(match.description),
    round: extractLocosRound(match.description),
    scheduledAt: toLocosDateTime(match),
    hasScore: match.homeScore != null || match.awayScore != null,
    hasVenue: Boolean(cleanText(match.venue)),
  }))

  const categories = new Map()
  const venues = new Map()
  const statuses = new Map()
  const dates = new Map()
  const rounds = new Map()

  enrichedMatches.forEach((match) => {
    const category = increment(categories, match.category, {
      finished: match.status === 'finished' ? 1 : 0,
      upcoming: match.status === 'upcoming' ? 1 : 0,
      live: match.status === 'live' ? 1 : 0,
      withScore: match.hasScore ? 1 : 0,
      withStream: match.streamUrl ? 1 : 0,
    })
    if (!category.sample) category.sample = match.description

    increment(venues, cleanText(match.venue) || 'Sin sede', {
      finished: match.status === 'finished' ? 1 : 0,
      upcoming: match.status === 'upcoming' ? 1 : 0,
    })
    increment(statuses, statusLabel(match.status))
    if (match.date) increment(dates, match.date, { upcoming: match.status === 'upcoming' ? 1 : 0, finished: match.status === 'finished' ? 1 : 0 })
    if (match.round != null) increment(rounds, `Fecha ${match.round}`, { round: match.round })
  })

  const fieldCoverage = {
    teams_with_logo: teams.filter((team) => team.logoUrl).length,
    matches_with_date: matches.filter((match) => match.date).length,
    matches_with_time: matches.filter((match) => match.time).length,
    matches_with_venue: matches.filter((match) => cleanText(match.venue)).length,
    matches_with_category: enrichedMatches.filter((match) => match.category !== 'Sin categoria').length,
    matches_with_round: enrichedMatches.filter((match) => match.round != null).length,
    matches_with_score: enrichedMatches.filter((match) => match.hasScore).length,
  }

  return {
    counts: {
      teams: teams.length,
      matches: matches.length,
      categories: categories.size,
      venues: venues.size,
      dates: dates.size,
      rounds: rounds.size,
      active_credit_plans: activeCreditPlans.length,
      finished_matches: finishedMatches.length,
      live_matches: liveMatches.length,
      upcoming_matches: upcomingMatches.length,
      matches_with_stream_url: matchesWithStream.length,
      matches_with_vod_url: matchesWithVod.length,
    },
    capabilities: {
      teams: teams.length > 0,
      fixtures: matches.length > 0,
      scores: matches.some((match) => match.homeScore != null || match.awayScore != null),
      venues: matches.some((match) => match.venue),
      streams: matchesWithStream.length > 0,
      vods: matchesWithVod.length > 0,
      credit_plans: creditPlans.length > 0,
      live_state: liveMatches.length > 0,
      categories: categories.size > 0,
      rounds: rounds.size > 0,
      dates: dates.size > 0,
    },
    summaries: {
      categories: sortSummary(categories.values()),
      venues: sortSummary(venues.values()),
      statuses: sortSummary(statuses.values()),
      dates: [...dates.values()].sort((a, b) => String(b.key).localeCompare(String(a.key))).slice(0, 12),
      rounds: [...rounds.values()].sort((a, b) => Number(a.round ?? 0) - Number(b.round ?? 0)),
      field_coverage: fieldCoverage,
    },
    samples: {
      teams: teams.slice(0, 6),
      matches: enrichedMatches
        .slice()
        .sort((a, b) => String(b.scheduledAt ?? b.date ?? '').localeCompare(String(a.scheduledAt ?? a.date ?? '')))
        .slice(0, 6)
        .map((match) => match),
      upcoming_matches: enrichedMatches
        .filter((match) => match.status === 'upcoming')
        .sort((a, b) => String(a.scheduledAt ?? a.date ?? '').localeCompare(String(b.scheduledAt ?? b.date ?? '')))
        .slice(0, 8),
      finished_matches: enrichedMatches
        .filter((match) => match.status === 'finished')
        .sort((a, b) => String(b.scheduledAt ?? b.date ?? '').localeCompare(String(a.scheduledAt ?? a.date ?? '')))
        .slice(0, 8),
      credit_plans: activeCreditPlans.slice(0, 6),
    },
    data: {
      teams,
      matches: enrichedMatches,
      credit_plans: activeCreditPlans,
    },
    recommendation: {
      importable: fieldCoverage.matches_with_date > 0 && teams.length > 0,
      safest_use: 'Fixture, resultados cerrados, equipos, escudos, sedes y categorias detectadas.',
      needs_review: 'Las categorias salen de la descripcion del partido; antes de importar hay que mapearlas contra ligas/fases de VMScore.',
      not_free_access: 'Los links de transmision y planes visibles no implican permiso ni acceso libre al video.',
    },
  }
}

export function locosCategoryKey(value) {
  return cleanText(value || 'all')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'all'
}

export function locosMatchToExternal(match) {
  const scheduledAt = toLocosScheduledAt(match)
  const status = normalizeLocosStatus(match.status)
  const hasFinishedScore = status === 'finished' && (match.homeScore != null || match.awayScore != null)

  return {
    external_match_id: match.id,
    external_home_team_id: match.homeTeamId,
    external_away_team_id: match.awayTeamId,
    external_home_team_name: match.homeTeam?.name ?? null,
    external_home_team_short_name: match.homeTeam?.shortName ?? null,
    external_home_team_logo_url: match.homeTeam?.logoUrl ?? null,
    external_away_team_name: match.awayTeam?.name ?? null,
    external_away_team_short_name: match.awayTeam?.shortName ?? null,
    external_away_team_logo_url: match.awayTeam?.logoUrl ?? null,
    scheduled_at: scheduledAt,
    date_tbd: !scheduledAt,
    round: match.round ?? null,
    status,
    home_score: hasFinishedScore ? Number(match.homeScore ?? 0) : null,
    away_score: hasFinishedScore ? Number(match.awayScore ?? 0) : null,
    raw: {
      ...match,
      source: 'locos_vm',
      venue_name: match.venue ?? null,
      category: match.category ?? null,
    },
  }
}

export function locosSnapshotToExternalMatches(snapshot, { category = 'all' } = {}) {
  const categoryFilter = locosCategoryKey(category)
  const matches = [
    ...(snapshot?.data?.matches ?? []),
    ...(snapshot?.samples?.matches ?? []),
    ...(snapshot?.samples?.upcoming_matches ?? []),
    ...(snapshot?.samples?.finished_matches ?? []),
  ]

  const byId = new Map()
  matches.forEach((match) => {
    if (!match?.id) return
    const matchCategory = locosCategoryKey(match.category)
    if (categoryFilter !== 'all' && matchCategory !== categoryFilter) return
    byId.set(match.id, match)
  })

  return [...byId.values()]
    .map(locosMatchToExternal)
    .sort((a, b) => {
      if (a.round !== b.round) return Number(a.round ?? 999) - Number(b.round ?? 999)
      return String(a.scheduled_at ?? '').localeCompare(String(b.scheduled_at ?? ''))
    })
}

export async function fetchLocosVmMatch(matchId) {
  const id = parseLocosVmMatchId(matchId)
  if (!id) throw new Error('Falta el ID del partido de Locos VM.')
  return firestoreDocToObject(await fetchFirestorePath(`matches/${id}`))
}

export async function fetchLocosVmLiveState(matchId) {
  const id = parseLocosVmMatchId(matchId)
  if (!id) throw new Error('Falta el ID del partido de Locos VM.')
  try {
    return firestoreDocToObject(await fetchFirestorePath(`matches/${id}/liveState/state`))
  } catch {
    return fetchLocosVmMatch(id)
  }
}

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function localDateKey(date) {
  if (!date) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/San_Luis',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(date))
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}`
}

function dateDistance(a, b) {
  if (!a || !b) return 30
  const diff = Math.abs(new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime())
  return diff / 86400000
}

function nameScore(vmName, appName) {
  const vm = normalizeText(vmName)
  const app = normalizeText(appName)
  if (!vm || !app) return 0
  if (vm === app) return 6
  if (vm.includes(app) || app.includes(vm)) return 4
  const appWords = app.split(' ').filter((word) => word.length > 2)
  const matches = appWords.filter((word) => vm.includes(word)).length
  return matches
}

function pairScore(candidate, match) {
  const direct =
    nameScore(candidate.homeTeam?.name, match.home_team_name) +
    nameScore(candidate.homeTeam?.shortName, match.home_team_short_name) +
    nameScore(candidate.awayTeam?.name, match.away_team_name) +
    nameScore(candidate.awayTeam?.shortName, match.away_team_short_name)

  const inverted =
    nameScore(candidate.homeTeam?.name, match.away_team_name) +
    nameScore(candidate.homeTeam?.shortName, match.away_team_short_name) +
    nameScore(candidate.awayTeam?.name, match.home_team_name) +
    nameScore(candidate.awayTeam?.shortName, match.home_team_short_name)

  return Math.max(direct, inverted)
}

export async function searchLocosVmMatchCandidates(match) {
  const [teams, matches] = await Promise.all([
    fetchFirestoreCollection('teams', 100, 3),
    fetchFirestoreCollection('matches', 100, 6),
  ])

  const teamsById = new Map(teams.map((team) => [team.id, team]))
  const matchDate = localDateKey(match?.scheduled_at)

  return matches
    .map((item) => {
      const candidate = {
        ...item,
        homeTeam: teamsById.get(item.homeTeamId),
        awayTeam: teamsById.get(item.awayTeamId),
      }
      const names = pairScore(candidate, match)
      const days = dateDistance(candidate.date, matchDate)
      const dateBonus = days === 0 ? 8 : days <= 1 ? 5 : days <= 3 ? 2 : 0
      return {
        ...candidate,
        confidence: names + dateBonus,
        dateDistance: days,
      }
    })
    .filter((item) => item.homeTeam && item.awayTeam && item.confidence >= 3)
    .sort((a, b) => b.confidence - a.confidence || a.dateDistance - b.dateDistance)
    .slice(0, 8)
}

export function normalizeLocosStatus(status) {
  if (status === 'live') return 'in_progress'
  if (status === 'finished') return 'finished'
  if (status === 'upcoming') return 'scheduled'
  return status || 'scheduled'
}

export function buildLiveStatePayload(state) {
  if (!state) return null
  return {
    status: normalizeLocosStatus(state.status),
    external_status: state.status ?? null,
    period: state.period ?? null,
    minute: Number.isFinite(Number(state.minute)) ? Number(state.minute) : null,
    second: Number.isFinite(Number(state.second)) ? Number(state.second) : null,
    home_score: Number.isFinite(Number(state.homeScore)) ? Number(state.homeScore) : null,
    away_score: Number.isFinite(Number(state.awayScore)) ? Number(state.awayScore) : null,
    timer_running: Boolean(state.timerRunning),
    viewer_count: Number.isFinite(Number(state.viewerCount)) ? Number(state.viewerCount) : null,
  }
}
