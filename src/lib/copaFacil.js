const FIREBASE_BASE = 'https://copafacil-web.firebaseio.com'

export function parseCopaFacilUrl(value) {
  const raw = String(value ?? '').trim()
  const match = raw.match(/copafacil\.com\/([^@/?#]+)@([^/?#]+)/i)
  if (!match) return null

  return {
    eventCode: decodeURIComponent(match[1]),
    divisionCode: decodeURIComponent(match[2]),
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
    isFinished: true,
  }
}

export async function fetchCopaFacilMatches({ eventCode, divisionCode }) {
  if (!eventCode || !divisionCode) {
    throw new Error('Falta el codigo de Copa Facil.')
  }

  const response = await fetch(`${FIREBASE_BASE}/events/${encodeURIComponent(eventCode)}/matchs.json`)
  if (!response.ok) {
    throw new Error(`Copa Facil respondio ${response.status}.`)
  }

  const payload = await response.json()
  const eventKey = `${eventCode}@${divisionCode}`
  const rawMatches = Object.entries(payload ?? {})
    .filter(([, match]) => match?.evt === eventKey)
    .map(([id, match]) => {
      const { homeScore, awayScore, isFinished } = parseScore(match)
      const rawDate = Number.isFinite(Number(match.d_i)) ? new Date(Number(match.d_i)).toISOString() : null

      return {
        external_match_id: id,
        external_home_team_id: match.team1,
        external_away_team_id: match.team2,
        scheduled_at: isFinished ? rawDate : null,
        date_tbd: !isFinished,
        copa_facil_raw_date: rawDate,
        home_score: homeScore,
        away_score: awayScore,
        status: isFinished ? 'finished' : 'scheduled',
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
    ;[
      match.external_home_team_id,
      match.external_away_team_id,
    ].forEach((teamId) => {
      if (!teamId) return
      const current = teams.get(teamId) ?? { external_team_id: teamId, matches: 0 }
      current.matches += 1
      teams.set(teamId, current)
    })
  })
  return [...teams.values()].sort((a, b) => b.matches - a.matches)
}
