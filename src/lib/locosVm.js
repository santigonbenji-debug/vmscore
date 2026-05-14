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

export async function fetchLocosVmMatch(matchId) {
  const id = parseLocosVmMatchId(matchId)
  if (!id) throw new Error('Falta el ID del partido de Locos VM.')
  return firestoreDocToObject(await fetchFirestorePath(`matches/${id}`))
}

export async function fetchLocosVmLiveState(matchId) {
  const id = parseLocosVmMatchId(matchId)
  if (!id) throw new Error('Falta el ID del partido de Locos VM.')
  return firestoreDocToObject(await fetchFirestorePath(`matches/${id}/liveState/state`))
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
