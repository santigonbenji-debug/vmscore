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
