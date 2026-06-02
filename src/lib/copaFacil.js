const FIREBASE_BASE = 'https://copafacil-web.firebaseio.com'
export const COPA_FACIL_ROOT_DIVISION = '__root__'

export function parseCopaFacilUrl(value) {
  const raw = String(value ?? '').trim()
  const match = raw.match(/copafacil\.com\/([^@/?#]+)(?:@([^/?#]+))?/i)
  if (!match) return null

  return {
    eventCode: decodeURIComponent(match[1]),
    divisionCode: match[2] ? decodeURIComponent(match[2]) : COPA_FACIL_ROOT_DIVISION,
  }
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseScore(match) {
  const dt = match?.dt
  const hasHomeScore = Object.prototype.hasOwnProperty.call(dt ?? {}, 'qt_g1')
  const hasAwayScore = Object.prototype.hasOwnProperty.call(dt ?? {}, 'qt_g2')
  const hasAnyScore = hasHomeScore || hasAwayScore

  if (!hasAnyScore) {
    return { homeScore: null, awayScore: null, isFinished: false }
  }

  return {
    homeScore: numberOrNull(dt.qt_g1) ?? 0,
    awayScore: numberOrNull(dt.qt_g2) ?? 0,
    isFinished: Boolean(match?.finished) || Number(match?.st) === 3,
  }
}

function isLiveStatus(match) {
  const statusText = String(match?.status ?? match?.state ?? match?.st_text ?? match?.estado ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  const numericStatus = Number(match?.st)

  return match?.live === true ||
    match?.in_progress === true ||
    match?.inProgress === true ||
    numericStatus === 2 ||
    statusText === 'live' ||
    statusText === 'in_progress' ||
    statusText === 'playing' ||
    statusText === 'en vivo' ||
    statusText === 'en_vivo'
}

function parseStatus(match, hasScore, isFinished) {
  if (isFinished) return 'finished'
  if (isLiveStatus(match)) return 'in_progress'
  if (hasScore) return 'in_progress'
  return 'scheduled'
}

export async function fetchCopaFacilMatches({ eventCode, divisionCode, fresh = true }) {
  if (!eventCode || !divisionCode) {
    throw new Error('Falta el codigo de Copa Facil.')
  }

  const url = new URL(`${FIREBASE_BASE}/events/${encodeURIComponent(eventCode)}/matchs.json`)
  const teamsUrl = new URL(`${FIREBASE_BASE}/events/${encodeURIComponent(eventCode)}/teams.json`)
  if (fresh) {
    const freshKey = String(Date.now())
    url.searchParams.set('_', freshKey)
    teamsUrl.searchParams.set('_', freshKey)
  }

  const fetchOptions = {
    cache: 'no-store',
    headers: {
      Pragma: 'no-cache',
      'Cache-Control': 'no-cache',
    },
  }
  const [response, teamsResponse] = await Promise.all([
    fetch(url.toString(), fetchOptions),
    fetch(teamsUrl.toString(), fetchOptions).catch(() => null),
  ])
  if (!response.ok) {
    throw new Error(`Copa Facil respondio ${response.status}.`)
  }

  const payload = await response.json()
  const teams = teamsResponse?.ok ? await teamsResponse.json() : {}
  const eventKey = `${eventCode}@${divisionCode}`
  const rawMatches = Object.entries(payload ?? {})
    .filter(([, match]) => (
      divisionCode === COPA_FACIL_ROOT_DIVISION
        ? !match?.evt || match.evt === eventCode
        : match?.evt === eventKey
    ))
    .map(([id, match]) => {
      const { homeScore, awayScore, isFinished } = parseScore(match)
      const hasScore = homeScore !== null || awayScore !== null
      const rawDate = Number.isFinite(Number(match.d_i)) ? new Date(Number(match.d_i)).toISOString() : null
      const status = parseStatus(match, hasScore, isFinished)
      const homeTeam = teams?.[match.team1] ?? {}
      const awayTeam = teams?.[match.team2] ?? {}

      return {
        external_match_id: id,
        external_home_team_id: match.team1,
        external_away_team_id: match.team2,
        external_home_team_name: homeTeam.name ?? null,
        external_home_team_short_name: homeTeam.short_name ?? null,
        external_home_team_logo_url: homeTeam.url ?? null,
        external_away_team_name: awayTeam.name ?? null,
        external_away_team_short_name: awayTeam.short_name ?? null,
        external_away_team_logo_url: awayTeam.url ?? null,
        scheduled_at: rawDate,
        date_tbd: !rawDate,
        copa_facil_raw_date: rawDate,
        home_score: homeScore,
        away_score: awayScore,
        status,
        match_set: match.m_set ?? null,
        stage_id: match.fs ?? null,
        raw: match,
      }
    })
    .sort((a, b) => String(a.match_set ?? '').localeCompare(String(b.match_set ?? '')))

  const rounds = new Map()
  rawMatches.forEach((match) => {
    const key = match.match_set ?? match.stage_id ?? 'sin-fecha'
    if (!rounds.has(key)) rounds.set(key, rounds.size + 1)
    match.round = rounds.get(key)
  })

  return rawMatches
}

export function summarizeExternalTeams(matches) {
  const teams = new Map()
  matches.forEach((match) => {
    ;[{
      id: match.external_home_team_id,
      name: match.external_home_team_name,
      shortName: match.external_home_team_short_name,
      logoUrl: match.external_home_team_logo_url,
    }, {
      id: match.external_away_team_id,
      name: match.external_away_team_name,
      shortName: match.external_away_team_short_name,
      logoUrl: match.external_away_team_logo_url,
    }].forEach((team) => {
      const teamId = team.id
      if (!teamId) return
      const current = teams.get(teamId) ?? {
        external_team_id: teamId,
        external_team_name: team.name ?? null,
        external_team_short_name: team.shortName ?? null,
        external_team_logo_url: team.logoUrl ?? null,
        matches: 0,
      }
      current.matches += 1
      current.external_team_name ||= team.name ?? null
      current.external_team_short_name ||= team.shortName ?? null
      current.external_team_logo_url ||= team.logoUrl ?? null
      teams.set(teamId, current)
    })
  })
  return [...teams.values()].sort((a, b) => b.matches - a.matches)
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

function nameScore(left, right) {
  const a = normalizeText(left)
  const b = normalizeText(right)
  if (!a || !b) return 0
  if (a === b) return 5
  if (a.includes(b) || b.includes(a)) return 3
  const words = b.split(' ').filter((word) => word.length > 2)
  return words.filter((word) => a.includes(word)).length
}

function pairScore({ candidate, match, mappedHomeId, mappedAwayId }) {
  const directMapped = mappedHomeId === match.home_team_id && mappedAwayId === match.away_team_id
  const invertedMapped = mappedHomeId === match.away_team_id && mappedAwayId === match.home_team_id
  if (directMapped || invertedMapped) return 20

  const directNames =
    nameScore(candidate.external_home_team_id, match.home_team_name) +
    nameScore(candidate.external_away_team_id, match.away_team_name)
  const invertedNames =
    nameScore(candidate.external_home_team_id, match.away_team_name) +
    nameScore(candidate.external_away_team_id, match.home_team_name)
  return Math.max(directNames, invertedNames)
}

export async function searchCopaFacilMatchCandidates({ match, sources, mappingsBySource }) {
  if (!match) throw new Error('Falta el partido de VMScore.')
  const usableSources = (sources ?? []).filter((source) => (
    source.provider === 'copafacil' &&
    source.event_code &&
    source.division_code &&
    (!match.league_id || source.league_id === match.league_id)
  ))

  const matchDate = localDateKey(match.scheduled_at)
  const candidates = []

  for (const source of usableSources) {
    const sourceMappings = mappingsBySource?.[source.id] ?? {}
    const sourceMatches = await fetchCopaFacilMatches({
      eventCode: source.event_code,
      divisionCode: source.division_code,
      fresh: true,
    })

    for (const candidate of sourceMatches) {
      const mappedHomeId = sourceMappings[candidate.external_home_team_id]
      const mappedAwayId = sourceMappings[candidate.external_away_team_id]
      const names = pairScore({ candidate, match, mappedHomeId, mappedAwayId })
      if (names <= 0) continue

      const days = dateDistance(localDateKey(candidate.scheduled_at), matchDate)
      const dateBonus = days === 0 ? 8 : days <= 1 ? 5 : days <= 3 ? 2 : 0
      const roundBonus = match.round && candidate.round && Number(match.round) === Number(candidate.round) ? 5 : 0
      const confidence = names + dateBonus + roundBonus

      candidates.push({
        ...candidate,
        source_id: source.id,
        source_label: source.label || source.leagues?.name || 'Copa Facil',
        source_url: source.source_url,
        mapped_home_team_id: mappedHomeId,
        mapped_away_team_id: mappedAwayId,
        confidence,
        dateDistance: days,
      })
    }
  }

  return candidates
    .filter((candidate) => candidate.confidence >= 8)
    .sort((a, b) => b.confidence - a.confidence || a.dateDistance - b.dateDistance || Number(a.round ?? 999) - Number(b.round ?? 999))
    .slice(0, 10)
}
