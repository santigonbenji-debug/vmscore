const FIREBASE_BASE = 'https://copafacil-web.firebaseio.com'

export function parseCopaFacilDeepUrl(value) {
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

async function readJson(path) {
  const response = await fetch(`${FIREBASE_BASE}${path}`)
  if (!response.ok) {
    throw new Error(`Copa Facil respondio ${response.status} en ${path}`)
  }
  return response.json()
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

function localIsoFromMillis(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? new Date(numeric).toISOString() : null
}

function assignRounds(matches) {
  const rounds = new Map()
  matches.forEach((match) => {
    const key = match.match_set ?? match.stage_id ?? 'sin-fecha'
    if (!rounds.has(key)) rounds.set(key, rounds.size + 1)
    match.round = rounds.get(key)
  })
  return matches
}

function summarizeTeams(matches) {
  const teams = new Map()
  matches.forEach((match) => {
    ;[
      match.external_home_team_id,
      match.external_away_team_id,
    ].forEach((teamId) => {
      if (!teamId) return
      const current = teams.get(teamId) ?? {
        external_team_id: teamId,
        matches: 0,
        name: null,
        logo_url: null,
      }
      current.matches += 1
      teams.set(teamId, current)
    })
  })
  return [...teams.values()].sort((a, b) => b.matches - a.matches)
}

function summarizeRounds(matches) {
  const rounds = new Map()
  matches.forEach((match) => {
    const current = rounds.get(match.round) ?? {
      round: match.round,
      total: 0,
      finished: 0,
      scheduled: 0,
      with_date: 0,
      without_date: 0,
      goals: 0,
      venue_ids: [],
    }

    current.total += 1
    if (match.status === 'finished') current.finished += 1
    else current.scheduled += 1
    if (match.scheduled_at) current.with_date += 1
    else current.without_date += 1
    if (match.home_score !== null && match.away_score !== null) {
      current.goals += match.home_score + match.away_score
    }
    if (match.venue_external_id && !current.venue_ids.includes(match.venue_external_id)) {
      current.venue_ids.push(match.venue_external_id)
    }

    rounds.set(match.round, current)
  })
  return [...rounds.values()].sort((a, b) => a.round - b.round)
}

function buildStandings(matches) {
  const table = new Map()

  function ensure(teamId) {
    if (!table.has(teamId)) {
      table.set(teamId, {
        external_team_id: teamId,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goals_for: 0,
        goals_against: 0,
        goal_diff: 0,
        points: 0,
      })
    }
    return table.get(teamId)
  }

  matches
    .filter((match) => match.status === 'finished' && match.home_score !== null && match.away_score !== null)
    .forEach((match) => {
      const home = ensure(match.external_home_team_id)
      const away = ensure(match.external_away_team_id)

      home.played += 1
      away.played += 1
      home.goals_for += match.home_score
      home.goals_against += match.away_score
      away.goals_for += match.away_score
      away.goals_against += match.home_score

      if (match.home_score > match.away_score) {
        home.won += 1
        away.lost += 1
        home.points += 3
      } else if (match.home_score < match.away_score) {
        away.won += 1
        home.lost += 1
        away.points += 3
      } else {
        home.drawn += 1
        away.drawn += 1
        home.points += 1
        away.points += 1
      }
    })

  return [...table.values()]
    .map((row) => ({
      ...row,
      goal_diff: row.goals_for - row.goals_against,
    }))
    .sort((a, b) =>
      b.points - a.points ||
      b.goal_diff - a.goal_diff ||
      b.goals_for - a.goals_for ||
      a.external_team_id.localeCompare(b.external_team_id)
    )
    .map((row, index) => ({ ...row, position: index + 1 }))
}

function extractMatches(rawMatches, eventCode, divisionCode) {
  const eventKey = `${eventCode}@${divisionCode}`
  return assignRounds(
    Object.entries(rawMatches ?? {})
      .filter(([, match]) => match?.evt === eventKey)
      .map(([id, match]) => {
        const { homeScore, awayScore, isFinished } = parseScore(match)
        const rawDate = localIsoFromMillis(match.d_i)
        return {
          external_match_id: id,
          external_home_team_id: match.team1 ?? null,
          external_away_team_id: match.team2 ?? null,
          scheduled_at: isFinished ? rawDate : null,
          copa_facil_raw_date: rawDate,
          date_tbd: !isFinished || !rawDate,
          home_score: homeScore,
          away_score: awayScore,
          status: isFinished ? 'finished' : 'scheduled',
          match_set: match.m_set ?? null,
          stage_id: match.fs ?? null,
          venue_external_id: match.l ?? null,
          venue_title: match.title ?? null,
          raw: match,
        }
      })
      .sort((a, b) => String(a.match_set ?? '').localeCompare(String(b.match_set ?? '')))
  )
}

export async function deepScrapeCopaFacil(sourceUrl) {
  const parsed = parseCopaFacilDeepUrl(sourceUrl)
  if (!parsed) {
    throw new Error('El link de Copa Facil no es valido.')
  }

  const [info, places, rawMatches] = await Promise.all([
    readJson(`/events/${encodeURIComponent(parsed.eventCode)}/info.json`).catch(() => null),
    readJson(`/events/${encodeURIComponent(parsed.eventCode)}/places.json`).catch(() => null),
    readJson(`/events/${encodeURIComponent(parsed.eventCode)}/matchs.json`),
  ])

  const matches = extractMatches(rawMatches, parsed.eventCode, parsed.divisionCode)
  const teams = summarizeTeams(matches)
  const rounds = summarizeRounds(matches)
  const standings = buildStandings(matches)
  const venues = Object.entries(places ?? {}).map(([external_venue_id, venue]) => ({
    external_venue_id,
    name: venue?.title ?? external_venue_id,
    address: venue?.address ?? '',
  }))

  return {
    provider: 'copafacil',
    source_url: sourceUrl,
    event_code: parsed.eventCode,
    division_code: parsed.divisionCode,
    mode: 'safe_snapshot',
    extracted: {
      tournament: {
        title: info?.info?.title?.trim() || null,
        logo_url: info?.url ?? null,
        event_code: parsed.eventCode,
        division_code: parsed.divisionCode,
      },
      capabilities: {
        fixture: true,
        results: true,
        venues: venues.length > 0,
        computed_standings: true,
        team_names: false,
        team_logos: false,
        player_rankings: false,
        match_events: false,
        lineups: false,
        visual_worker_required: true,
      },
      counts: {
        matches: matches.length,
        teams: teams.length,
        rounds: rounds.length,
        venues: venues.length,
        finished_matches: matches.filter((match) => match.status === 'finished').length,
        pending_matches: matches.filter((match) => match.status !== 'finished').length,
      },
      teams,
      venues,
      rounds,
      standings,
      matches,
      missing: [
        'Nombres y escudos de equipos requieren worker visual o mapeo manual.',
        'Goleadores por jugador requieren worker visual o importacion asistida.',
        'Eventos, tarjetas y alineaciones requieren worker visual por detalle de partido.',
      ],
    },
    raw: {
      info,
      places,
      match_count_raw: Object.keys(rawMatches ?? {}).length,
    },
  }
}
