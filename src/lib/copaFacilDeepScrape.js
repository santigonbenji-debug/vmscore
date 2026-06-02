const FIREBASE_BASE = 'https://copafacil-web.firebaseio.com'
const COPA_FACIL_ROOT_DIVISION = '__root__'

export function parseCopaFacilDeepUrl(value) {
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

function parseStatsString(value) {
  return String(value ?? '')
    .split('#')
    .map((part) => part.split('='))
    .filter(([key]) => key !== undefined && key !== '')
    .reduce((acc, [key, rawValue]) => {
      acc[key] = numberOrNull(rawValue)
      return acc
    }, {})
}

function teamName(rawTeams, teamId) {
  return rawTeams?.[teamId]?.name?.trim() || null
}

function teamLogo(rawTeams, teamId) {
  return rawTeams?.[teamId]?.url || null
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
    isFinished: Boolean(match?.finished) || Number(match?.st) === 3,
  }
}

function isFinishedStatus(match) {
  return Boolean(match?.finished) || Number(match?.st) === 3
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

function summarizeTeams(matches, rawTeams) {
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
        name: rawTeams?.[teamId]?.name ?? null,
        logo_url: rawTeams?.[teamId]?.url ?? null,
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

function buildOfficialStandings(rawTeams, stageId) {
  return Object.entries(rawTeams ?? {})
    .map(([teamId, team]) => {
      const stageStats = stageId
        ? team?.dt?.[stageId]
        : Object.values(team?.dt ?? {})[0]
      const stats = parseStatsString(stageStats?.dt)
      if (!stageStats?.dt) return null

      return {
        external_team_id: teamId,
        team_name: teamName(rawTeams, teamId),
        team_logo_url: teamLogo(rawTeams, teamId),
        position: Number.isFinite(Number(stageStats.col)) ? Number(stageStats.col) + 1 : null,
        played: numberOrNull(stats['1']) ?? 0,
        won: numberOrNull(stats['2']) ?? 0,
        drawn: numberOrNull(stats['3']) ?? 0,
        lost: numberOrNull(stats['4']) ?? 0,
        goals_for: numberOrNull(stats['5']) ?? 0,
        goals_against: numberOrNull(stats['6']) ?? 0,
        goal_diff: numberOrNull(stats['7']) ?? 0,
        points: numberOrNull(stats['0']) ?? 0,
        fair_play: numberOrNull(stats['9']) ?? 0,
        percentage: numberOrNull(stats['8']),
        source_stats: stageStats.dt,
      }
    })
    .filter(Boolean)
    .sort((a, b) =>
      (a.position ?? 999) - (b.position ?? 999) ||
      b.points - a.points ||
      b.goal_diff - a.goal_diff ||
      b.goals_for - a.goals_for ||
      String(a.team_name ?? a.external_team_id).localeCompare(String(b.team_name ?? b.external_team_id))
    )
    .map((row, index) => ({
      ...row,
      position: row.position ?? index + 1,
    }))
}

function extractMatches(rawMatches, eventCode, divisionCode, rawTeams) {
  const eventKey = `${eventCode}@${divisionCode}`
  return assignRounds(
    Object.entries(rawMatches ?? {})
      .filter(([, match]) => (
        divisionCode === COPA_FACIL_ROOT_DIVISION
          ? !match?.evt || match.evt === eventCode
          : match?.evt === eventKey
      ))
      .map(([id, match]) => {
        const { homeScore, awayScore, isFinished } = parseScore(match)
        const status = isFinishedStatus(match) || isFinished
          ? 'finished'
          : isLiveStatus(match)
            ? 'in_progress'
            : 'scheduled'
        const rawDate = localIsoFromMillis(match.d_i)
        return {
          external_match_id: id,
          external_home_team_id: match.team1 ?? null,
          external_away_team_id: match.team2 ?? null,
          external_home_team_name: teamName(rawTeams, match.team1),
          external_away_team_name: teamName(rawTeams, match.team2),
          external_home_team_logo_url: teamLogo(rawTeams, match.team1),
          external_away_team_logo_url: teamLogo(rawTeams, match.team2),
          scheduled_at: status === 'finished' || status === 'in_progress' ? rawDate : null,
          copa_facil_raw_date: rawDate,
          date_tbd: status === 'scheduled' || !rawDate,
          home_score: homeScore,
          away_score: awayScore,
          status,
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

  const [info, places, rawMatches, rawTeams] = await Promise.all([
    readJson(`/events/${encodeURIComponent(parsed.eventCode)}/info.json`).catch(() => null),
    readJson(`/events/${encodeURIComponent(parsed.eventCode)}/places.json`).catch(() => null),
    readJson(`/events/${encodeURIComponent(parsed.eventCode)}/matchs.json`),
    readJson(`/events/${encodeURIComponent(parsed.eventCode)}/teams.json`).catch(() => null),
  ])

  const matches = extractMatches(rawMatches, parsed.eventCode, parsed.divisionCode, rawTeams)
  const teams = summarizeTeams(matches, rawTeams)
  const rounds = summarizeRounds(matches)
  const primaryStageId = matches.find((match) => match.stage_id)?.stage_id
  const officialStandings = buildOfficialStandings(rawTeams, primaryStageId)
  const computedStandings = buildStandings(matches).map((row) => ({
    ...row,
    team_name: teamName(rawTeams, row.external_team_id),
    team_logo_url: teamLogo(rawTeams, row.external_team_id),
  }))
  const standings = officialStandings.length > 0 ? officialStandings : computedStandings
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
        computed_standings: computedStandings.length > 0,
        official_standings: officialStandings.length > 0,
        team_names: teams.some((team) => team.name),
        team_logos: teams.some((team) => team.logo_url),
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
      official_standings: officialStandings,
      computed_standings: computedStandings,
      matches,
      missing: [
        ...(!teams.some((team) => team.name) || !teams.some((team) => team.logo_url)
          ? ['Algunos nombres o escudos de equipos requieren worker visual o mapeo manual.']
          : []),
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
