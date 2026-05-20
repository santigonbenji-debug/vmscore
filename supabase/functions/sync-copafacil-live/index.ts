import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const firebaseBase = 'https://copafacil-web.firebaseio.com'

const supabase = createClient(supabaseUrl, serviceRoleKey)

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function hasScore(raw: Record<string, unknown>) {
  const details = (raw.dt ?? {}) as Record<string, unknown>
  return Object.prototype.hasOwnProperty.call(details, 'qt_g1') ||
    Object.prototype.hasOwnProperty.call(details, 'qt_g2')
}

function isLiveStatus(raw: Record<string, unknown>) {
  const statusText = String(raw.status ?? raw.state ?? raw.st_text ?? raw.estado ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  const numericStatus = Number(raw.st)

  return raw.live === true ||
    raw.in_progress === true ||
    raw.inProgress === true ||
    numericStatus === 2 ||
    statusText === 'live' ||
    statusText === 'in_progress' ||
    statusText === 'playing' ||
    statusText === 'en vivo' ||
    statusText === 'en_vivo'
}

function normalizeStatus(raw: Record<string, unknown>) {
  if (raw.finished === true || Number(raw.st) === 3) return 'finished'
  if (isLiveStatus(raw)) return 'in_progress'
  if (hasScore(raw)) return 'in_progress'
  return 'scheduled'
}

function teamName(match: Record<string, unknown>, side: 'home' | 'away') {
  if (side === 'home') return match.home_team_short_name || match.home_team_name || 'Local'
  return match.away_team_short_name || match.away_team_name || 'Visitante'
}

function scoreText(match: Record<string, unknown>, homeScore: number | null, awayScore: number | null) {
  return `${teamName(match, 'home')} ${homeScore ?? '-'} - ${awayScore ?? '-'} ${teamName(match, 'away')}`
}

async function sendPush(match: Record<string, unknown>, type: string, title: string, body: string, targetTeamIds?: string[]) {
  await fetch(`${supabaseUrl}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ type, matchId: match.id, title, body, targetTeamIds }),
  }).catch(() => null)
}

function buildGoalEvents({
  match,
  link,
  previousHome,
  previousAway,
  nextHome,
  nextAway,
  raw,
}: {
  match: Record<string, unknown>
  link: Record<string, unknown>
  previousHome: number
  previousAway: number
  nextHome: number
  nextAway: number
  raw: Record<string, unknown>
}) {
  const events: Record<string, unknown>[] = []

  for (let score = previousHome + 1; score <= nextHome; score += 1) {
    events.push({
      match_id: match.id,
      link_id: link.id,
      provider: 'copafacil',
      external_match_id: link.external_match_id,
      event_key: `goal-home-${score}-${nextAway}`,
      event_type: 'goal',
      team_id: match.home_team_id,
      team_side: 'home',
      home_score: score,
      away_score: nextAway,
      title: `Gol de ${teamName(match, 'home')}`,
      raw,
    })
  }

  for (let score = previousAway + 1; score <= nextAway; score += 1) {
    events.push({
      match_id: match.id,
      link_id: link.id,
      provider: 'copafacil',
      external_match_id: link.external_match_id,
      event_key: `goal-away-${nextHome}-${score}`,
      event_type: 'goal',
      team_id: match.away_team_id,
      team_side: 'away',
      home_score: nextHome,
      away_score: score,
      title: `Gol de ${teamName(match, 'away')}`,
      raw,
    })
  }

  return events
}

async function fetchSourceMatches(eventCode: string) {
  const url = new URL(`${firebaseBase}/events/${encodeURIComponent(eventCode)}/matchs.json`)
  url.searchParams.set('_', String(Date.now()))
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      Pragma: 'no-cache',
      'Cache-Control': 'no-cache',
    },
  })
  if (!response.ok) throw new Error(`Copa Facil ${response.status}`)
  return await response.json() as Record<string, Record<string, unknown>>
}

async function ensureLink(match: Record<string, unknown>, currentLink?: Record<string, unknown>) {
  if (currentLink) return currentLink

  const { data, error } = await supabase
    .from('match_live_links')
    .upsert({
      match_id: match.id,
      provider: 'copafacil',
      external_match_id: match.external_match_id,
      enabled: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'match_id,provider' })
    .select()
    .single()
  if (error) throw error
  return data
}

async function syncMatch(match: Record<string, unknown>, source: Record<string, unknown>, rawPayload: Record<string, Record<string, unknown>>, currentLink?: Record<string, unknown>) {
  const raw = rawPayload[String(match.external_match_id)]
  if (!raw) return { id: match.id, skipped: 'missing_external_match' }
  if (raw.evt !== `${source.event_code}@${source.division_code}`) {
    return { id: match.id, skipped: 'division_mismatch' }
  }

  const link = await ensureLink(match, currentLink)
  const status = normalizeStatus(raw)
  const details = (raw.dt ?? {}) as Record<string, unknown>
  const nextHome = numberOrNull(details.qt_g1)
  const nextAway = numberOrNull(details.qt_g2)
  const previousHome = numberOrNull(link.last_home_score) ?? numberOrNull(match.home_score) ?? 0
  const previousAway = numberOrNull(link.last_away_score) ?? numberOrNull(match.away_score) ?? 0
  const now = new Date().toISOString()

  const events: Record<string, unknown>[] = []
  const startedNow = !link.last_start_notified_at && status === 'in_progress'
  const finishedNow = !link.last_finish_notified_at && status === 'finished'

  if (startedNow) {
    events.push({
      match_id: match.id,
      link_id: link.id,
      provider: 'copafacil',
      external_match_id: link.external_match_id,
      event_key: 'match-started',
      event_type: 'start',
      home_score: nextHome,
      away_score: nextAway,
      title: 'Inicio del partido',
      raw,
    })
  }

  const goalEvents = nextHome !== null && nextAway !== null
    ? buildGoalEvents({ match, link, previousHome, previousAway, nextHome, nextAway, raw })
    : []
  events.push(...goalEvents)

  if (finishedNow) {
    events.push({
      match_id: match.id,
      link_id: link.id,
      provider: 'copafacil',
      external_match_id: link.external_match_id,
      event_key: `match-finished-${nextHome ?? '-'}-${nextAway ?? '-'}`,
      event_type: 'finish',
      home_score: nextHome,
      away_score: nextAway,
      title: `Finalizo: ${scoreText(match, nextHome, nextAway)}`,
      raw,
    })
  }

  if (events.length > 0) {
    const { error } = await supabase
      .from('live_sync_events')
      .upsert(events, { onConflict: 'match_id,provider,event_key', ignoreDuplicates: true })
    if (error) throw error
  }

  const { error: linkError } = await supabase
    .from('match_live_links')
    .update({
      last_external_state: raw,
      last_status: status,
      last_home_score: nextHome,
      last_away_score: nextAway,
      last_synced_at: now,
      last_start_notified_at: startedNow ? now : link.last_start_notified_at,
      last_finish_notified_at: finishedNow ? now : link.last_finish_notified_at,
      updated_at: now,
    })
    .eq('id', link.id)
  if (linkError) throw linkError

  if (status === 'in_progress' && nextHome !== null && nextAway !== null && match.status !== 'postponed' && match.status !== 'cancelled') {
    await supabase
      .from('matches')
      .update({
        status: 'in_progress',
        home_score: nextHome,
        away_score: nextAway,
        updated_at: now,
      })
      .eq('id', match.id)
  }

  if (startedNow) {
    await sendPush(match, 'match_started', 'Inicio del partido', `${teamName(match, 'home')} vs ${teamName(match, 'away')}`)
  }
  for (const goal of goalEvents) {
    const scoringTeamId = String(goal.team_id)
    await sendPush(
      match,
      'match_goal',
      String(goal.title),
      scoreText(match, numberOrNull(goal.home_score), numberOrNull(goal.away_score)),
      [scoringTeamId],
    )
  }
  if (finishedNow) {
    await sendPush(match, 'match_finished_live', 'Finalizo el partido', scoreText(match, nextHome, nextAway))
  }

  return { id: match.id, events: events.length, status }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const limit = Math.min(Number(body.limit ?? 60), 120)
    const matchIds = Array.isArray(body.matchIds) ? body.matchIds.filter(Boolean) : []
    let matchQuery = supabase
      .from('v_matches')
      .select('*')
      .eq('external_provider', 'copafacil')
      .in('status', ['scheduled', 'in_progress'])
      .not('external_source_id', 'is', null)
      .not('external_match_id', 'is', null)
      .limit(limit)
    if (matchIds.length > 0) {
      matchQuery = matchQuery.in('id', matchIds)
    }
    const { data: matches, error: matchError } = await matchQuery
    if (matchError) throw matchError

    const sourceIds = [...new Set((matches ?? []).map((match) => match.external_source_id).filter(Boolean))]
    const { data: sources, error: sourceError } = await supabase
      .from('external_sources')
      .select('*')
      .in('id', sourceIds)
      .eq('provider', 'copafacil')
      .eq('sync_enabled', true)
    if (sourceError) throw sourceError

    const queriedMatchIds = (matches ?? []).map((match) => match.id)
    const { data: links, error: linkError } = await supabase
      .from('match_live_links')
      .select('*')
      .in('match_id', queriedMatchIds)
      .eq('provider', 'copafacil')
    if (linkError) throw linkError

    const sourceMap = new Map((sources ?? []).map((source) => [source.id, source]))
    const linkMap = new Map((links ?? []).map((link) => [link.match_id, link]))
    const payloads = new Map<string, Record<string, Record<string, unknown>>>()
    const results = []

    for (const source of sources ?? []) {
      payloads.set(source.id, await fetchSourceMatches(String(source.event_code)))
    }

    for (const match of matches ?? []) {
      const source = sourceMap.get(match.external_source_id)
      const payload = payloads.get(match.external_source_id)
      if (!source || !payload) {
        results.push({ id: match.id, skipped: 'missing_source' })
        continue
      }
      try {
        results.push(await syncMatch(match, source, payload, linkMap.get(match.id)))
      } catch (error) {
        results.push({ id: match.id, error: error?.message ?? 'sync failed' })
      }
    }

    return new Response(JSON.stringify({ ok: true, checked: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error?.message ?? 'sync failed' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
