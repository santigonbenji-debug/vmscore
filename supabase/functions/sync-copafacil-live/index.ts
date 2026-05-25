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

function scoresFromRaw(raw: Record<string, unknown>) {
  const details = (raw.dt ?? {}) as Record<string, unknown>
  if (!hasScore(raw)) return { home: null, away: null }

  // Copa Facil omite en algunos partidos la clave del equipo que tiene cero.
  return {
    home: numberOrNull(details.qt_g1) ?? 0,
    away: numberOrNull(details.qt_g2) ?? 0,
  }
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

function startedBySchedule(match: Record<string, unknown>) {
  if (!match.scheduled_at || match.status !== 'scheduled') return false
  return new Date(String(match.scheduled_at)).getTime() <= Date.now()
}

function normalizeStatus(raw: Record<string, unknown>, match: Record<string, unknown>) {
  const statusText = String(raw.status ?? raw.state ?? raw.st_text ?? raw.estado ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

  if (
    raw.finished === true ||
    Number(raw.st) === 3 ||
    statusText === 'finished' ||
    statusText === 'finalizado' ||
    statusText === 'finalizada' ||
    statusText === 'ft' ||
    statusText === 'final'
  ) return 'finished'
  if (isLiveStatus(raw)) return 'in_progress'
  if (hasScore(raw)) return 'in_progress'
  if (startedBySchedule(match)) return 'in_progress'
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
  const response = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ type, matchId: match.id, title, body, targetTeamIds }),
  })
  const result = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }))
  if (!response.ok || result.ok !== true) {
    throw new Error(result.error || result.errors?.join('; ') || `Push HTTP ${response.status}`)
  }
  return result
}

async function deliverPendingPushes(match: Record<string, unknown>, link: Record<string, unknown>) {
  const { data: pending, error } = await supabase
    .from('live_sync_events')
    .select('*')
    .eq('match_id', match.id)
    .is('push_notified_at', null)
    .in('event_type', ['start', 'goal', 'finish'])
    .order('created_at', { ascending: true })
  if (error) throw error

  const deliveries = []
  for (const event of pending ?? []) {
    try {
      let delivery
      if (event.event_type === 'start') {
        delivery = await sendPush(match, 'match_started', 'Inicio del partido', `${teamName(match, 'home')} vs ${teamName(match, 'away')}`)
      } else if (event.event_type === 'goal') {
        delivery = await sendPush(
          match,
          'match_goal',
          String(event.title),
          scoreText(match, numberOrNull(event.home_score), numberOrNull(event.away_score)),
        )
      } else {
        delivery = await sendPush(match, 'match_finished_live', 'Finalizo el partido', scoreText(match, numberOrNull(event.home_score), numberOrNull(event.away_score)))
      }

      const deliveredAt = new Date().toISOString()
      await supabase
        .from('live_sync_events')
        .update({ push_attempted_at: deliveredAt, push_notified_at: deliveredAt, push_error: null })
        .eq('id', event.id)

      if (event.event_type === 'start') {
        await supabase.from('match_live_links').update({ last_start_notified_at: deliveredAt }).eq('id', link.id)
      }
      if (event.event_type === 'finish') {
        await supabase.from('match_live_links').update({ last_finish_notified_at: deliveredAt }).eq('id', link.id)
      }
      deliveries.push({ event: event.event_type, ok: true, recipients: delivery.recipients ?? 0, sent: delivery.sent ?? 0 })
    } catch (pushError) {
      const attemptedAt = new Date().toISOString()
      const message = pushError?.message ?? 'No se pudo enviar push'
      await supabase
        .from('live_sync_events')
        .update({ push_attempted_at: attemptedAt, push_error: message })
        .eq('id', event.id)
      deliveries.push({ event: event.event_type, ok: false, error: message })
    }
  }
  return deliveries
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
      goal_number: score,
      home_score: score,
      away_score: nextAway,
      title: `Gol de ${teamName(match, 'home')}`,
      status: 'applied',
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
      goal_number: score,
      home_score: nextHome,
      away_score: score,
      title: `Gol de ${teamName(match, 'away')}`,
      status: 'applied',
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
  const status = normalizeStatus(raw, match)
  const sourceScores = scoresFromRaw(raw)
  const nextHome = sourceScores.home
  const nextAway = sourceScores.away
  const linkHome = numberOrNull(link.last_home_score)
  const linkAway = numberOrNull(link.last_away_score)
  const matchHome = numberOrNull(match.home_score)
  const matchAway = numberOrNull(match.away_score)
  const previousHome = Math.max(linkHome ?? 0, matchHome ?? 0)
  const previousAway = Math.max(linkAway ?? 0, matchAway ?? 0)
  const hadPreviousScore = linkHome !== null && linkAway !== null || matchHome !== null && matchAway !== null
  const wasLiveBefore = link.last_status === 'in_progress' || match.status === 'in_progress'
  const now = new Date().toISOString()
  const publishedHome = status === 'finished'
    ? nextHome
    : status === 'in_progress' && nextHome === null
      ? matchHome ?? linkHome ?? 0
      : nextHome === null ? matchHome : Math.max(nextHome, previousHome)
  const publishedAway = status === 'finished'
    ? nextAway
    : status === 'in_progress' && nextAway === null
      ? matchAway ?? linkAway ?? 0
      : nextAway === null ? matchAway : Math.max(nextAway, previousAway)

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
      status: 'applied',
      raw,
    })
  }

  const shouldEmitGoalEvents = nextHome !== null && nextAway !== null && (
    status === 'in_progress' ||
    (status === 'finished' && wasLiveBefore && hadPreviousScore)
  )
  const goalEvents = shouldEmitGoalEvents
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
      status: 'applied',
      raw,
    })
  }

  let insertedEvents: Record<string, unknown>[] = []
  if (events.length > 0) {
    const { data, error } = await supabase
      .from('live_sync_events')
      .upsert(events, { ignoreDuplicates: true })
      .select()
    if (error) throw error
    insertedEvents = data ?? []
  }

  const { error: linkError } = await supabase
    .from('match_live_links')
    .update({
      last_external_state: raw,
      last_status: status,
      last_home_score: publishedHome,
      last_away_score: publishedAway,
      last_synced_at: now,
      updated_at: now,
    })
    .eq('id', link.id)
  if (linkError) throw linkError

  if (match.status !== 'postponed' && match.status !== 'cancelled') {
    if (status === 'in_progress') {
      await supabase
        .from('matches')
        .update({
          status: 'in_progress',
          home_score: publishedHome,
          away_score: publishedAway,
          updated_at: now,
        })
        .eq('id', match.id)
    }

    if (status === 'finished' && publishedHome !== null && publishedAway !== null) {
      await supabase
        .from('matches')
        .update({
          status: 'finished',
          home_score: publishedHome,
          away_score: publishedAway,
          updated_at: now,
        })
        .eq('id', match.id)
    }
  }

  const deliveries = await deliverPendingPushes(match, link)

  return { id: match.id, events: insertedEvents.length, deliveries, status, home_score: publishedHome, away_score: publishedAway }
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
