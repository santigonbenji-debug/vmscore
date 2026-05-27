import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const locosApiKey = 'AIzaSyDLwg8vbP8NK5upYoxOmyp5WUdj-scV80I'
const firestoreBase = 'https://firestore.googleapis.com/v1/projects/locos-por-el-futbol-vm/databases/(default)/documents'

const supabase = createClient(supabaseUrl, serviceRoleKey)

function fieldValue(field: Record<string, unknown> | undefined): unknown {
  if (!field) return null
  if ('stringValue' in field) return field.stringValue
  if ('integerValue' in field) return Number(field.integerValue)
  if ('doubleValue' in field) return Number(field.doubleValue)
  if ('booleanValue' in field) return field.booleanValue
  if ('timestampValue' in field) return field.timestampValue
  if ('nullValue' in field) return null
  if ('arrayValue' in field) {
    const arrayValue = field.arrayValue as { values?: Record<string, unknown>[] }
    return (arrayValue.values ?? []).map(fieldValue)
  }
  if ('mapValue' in field) {
    const mapValue = field.mapValue as { fields?: Record<string, Record<string, unknown>> }
    return Object.fromEntries(Object.entries(mapValue.fields ?? {}).map(([key, value]) => [key, fieldValue(value)]))
  }
  return null
}

async function fetchLocosState(externalMatchId: string) {
  const url = `${firestoreBase}/matches/${externalMatchId}/liveState/state?key=${locosApiKey}`
  const response = await fetch(url)
  if (response.ok) {
    const document = await response.json()
    return Object.fromEntries(Object.entries(document.fields ?? {}).map(([key, value]) => [key, fieldValue(value as Record<string, unknown>)]))
  }

  const fallbackUrl = `${firestoreBase}/matches/${externalMatchId}?key=${locosApiKey}`
  const fallbackResponse = await fetch(fallbackUrl)
  if (!fallbackResponse.ok) throw new Error(`Locos VM ${fallbackResponse.status}`)
  const document = await fallbackResponse.json()
  return Object.fromEntries(Object.entries(document.fields ?? {}).map(([key, value]) => [key, fieldValue(value as Record<string, unknown>)]))
}

function normalizeStatus(status: unknown) {
  if (status === 'live') return 'in_progress'
  if (status === 'finished') return 'finished'
  if (status === 'upcoming') return 'scheduled'
  return String(status || 'scheduled')
}

function teamName(match: Record<string, unknown>, side: 'home' | 'away') {
  if (side === 'home') return match.home_team_short_name || match.home_team_name || 'Local'
  return match.away_team_short_name || match.away_team_name || 'Visitante'
}

function scoreText(match: Record<string, unknown>, homeScore: number | null, awayScore: number | null) {
  return `${teamName(match, 'home')} ${homeScore ?? '-'} - ${awayScore ?? '-'} ${teamName(match, 'away')}`
}

function numberOrNull(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function goalEvents({ match, link, previousHome, previousAway, nextHome, nextAway, minute, raw }: {
  match: Record<string, unknown>
  link: Record<string, unknown>
  previousHome: number
  previousAway: number
  nextHome: number
  nextAway: number
  minute: number | null
  raw: Record<string, unknown>
}) {
  const events: Record<string, unknown>[] = []
  for (let score = previousHome + 1; score <= nextHome; score += 1) {
    events.push({
      match_id: match.id,
      link_id: link.id,
      provider: 'locos_vm',
      external_match_id: link.external_match_id,
      event_key: `goal-home-${score}-${nextAway}`,
      event_type: 'goal',
      team_id: match.home_team_id,
      team_side: 'home',
      goal_number: score,
      minute,
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
      provider: 'locos_vm',
      external_match_id: link.external_match_id,
      event_key: `goal-away-${nextHome}-${score}`,
      event_type: 'goal',
      team_id: match.away_team_id,
      team_side: 'away',
      goal_number: score,
      minute,
      home_score: nextHome,
      away_score: score,
      title: `Gol de ${teamName(match, 'away')}`,
      raw,
    })
  }
  return events
}

async function sendPush(match: Record<string, unknown>, type: string, title: string, body: string) {
  const response = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ type, matchId: match.id, title, body }),
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
    .eq('provider', 'locos_vm')
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

async function syncLink(link: Record<string, unknown>) {
  const { data: match, error: matchError } = await supabase
    .from('v_matches')
    .select('*')
    .eq('id', link.match_id)
    .single()
  if (matchError) throw matchError

  const raw = await fetchLocosState(String(link.external_match_id))
  const status = normalizeStatus(raw.status)
  const minute = numberOrNull(raw.minute)
  const second = numberOrNull(raw.second)
  const nextHome = numberOrNull(raw.homeScore)
  const nextAway = numberOrNull(raw.awayScore)
  const previousHome = Math.max(numberOrNull(link.last_home_score) ?? 0, numberOrNull(match.home_score) ?? 0)
  const previousAway = Math.max(numberOrNull(link.last_away_score) ?? 0, numberOrNull(match.away_score) ?? 0)
  const now = new Date().toISOString()
  const isStarted = ['in_progress', 'paused', 'finished'].includes(status)
  const liveStartedAt = link.live_started_at ?? (isStarted ? now : null)
  const halftimeNow = status === 'paused' && !link.halftime_at
  const halftimeAt = link.halftime_at ?? (halftimeNow ? now : null)
  const secondHalfNow = status === 'in_progress' && Boolean(halftimeAt) && !link.second_half_started_at
  const secondHalfStartedAt = link.second_half_started_at ?? (secondHalfNow ? now : null)
  const publishedHome = status === 'finished' ? nextHome : nextHome === null ? numberOrNull(match.home_score) : Math.max(nextHome, previousHome)
  const publishedAway = status === 'finished' ? nextAway : nextAway === null ? numberOrNull(match.away_score) : Math.max(nextAway, previousAway)

  const events: Record<string, unknown>[] = []
  const startedNow = !link.last_start_notified_at && ['in_progress', 'paused'].includes(status)
  const finishedNow = !link.last_finish_notified_at && status === 'finished'

  if (startedNow) {
    events.push({
      match_id: match.id,
      link_id: link.id,
      provider: 'locos_vm',
      external_match_id: link.external_match_id,
      event_key: 'match-started',
      event_type: 'start',
      minute: minute ?? 0,
      home_score: nextHome,
      away_score: nextAway,
      title: 'Inicio del partido',
      status: 'applied',
      raw,
    })
  }

  const detectedGoals = nextHome !== null && nextAway !== null
    ? goalEvents({ match, link, previousHome, previousAway, nextHome, nextAway, minute, raw })
    : []
  events.push(...detectedGoals)

  if (halftimeNow) {
    events.push({
      match_id: match.id,
      link_id: link.id,
      provider: 'locos_vm',
      external_match_id: link.external_match_id,
      event_key: 'match-halftime',
      event_type: 'halftime',
      minute: 45,
      home_score: nextHome,
      away_score: nextAway,
      title: 'Final del primer tiempo',
      status: 'applied',
      raw,
    })
  }

  if (finishedNow) {
    events.push({
      match_id: match.id,
      link_id: link.id,
      provider: 'locos_vm',
      external_match_id: link.external_match_id,
      event_key: `match-finished-${nextHome ?? '-'}-${nextAway ?? '-'}`,
      event_type: 'finish',
      minute,
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
      .upsert(events.map((event) => ({ ...event, status: 'applied' })), { ignoreDuplicates: true })
      .select()
    if (error) throw error
    insertedEvents = data ?? []
  }

  const { error: updateError } = await supabase
    .from('match_live_links')
    .update({
      last_external_state: raw,
      last_status: status,
      last_period: raw.period ?? null,
      last_minute: minute,
      last_second: second,
      last_home_score: publishedHome,
      last_away_score: publishedAway,
      last_synced_at: now,
      live_started_at: liveStartedAt,
      halftime_at: halftimeAt,
      second_half_started_at: secondHalfStartedAt,
      updated_at: now,
    })
    .eq('id', link.id)
  if (updateError) throw updateError

  if (['in_progress', 'paused', 'finished'].includes(status) && match.status !== 'postponed' && match.status !== 'cancelled') {
    const matchUpdate: Record<string, unknown> = {
      status: status === 'finished' ? 'finished' : 'in_progress',
      updated_at: now,
    }
    if (publishedHome !== null && publishedAway !== null) {
      matchUpdate.home_score = publishedHome
      matchUpdate.away_score = publishedAway
    }
    const { error: matchUpdateError } = await supabase
      .from('matches')
      .update(matchUpdate)
      .eq('id', match.id)
    if (matchUpdateError) throw matchUpdateError
  }

  const deliveries = await deliverPendingPushes(match, link)

  return { id: link.id, events: insertedEvents.length, deliveries, status, home_score: publishedHome, away_score: publishedAway }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const limit = Math.min(Number(body.limit ?? 20), 50)
    const matchIds = Array.isArray(body.matchIds) ? body.matchIds.filter(Boolean) : []
    let query = supabase
      .from('match_live_links')
      .select('*')
      .eq('provider', 'locos_vm')
      .eq('enabled', true)
      .limit(limit)
    if (matchIds.length > 0) query = query.in('match_id', matchIds)
    const { data: links, error } = await query

    if (error) throw error

    const results = []
    for (const link of links ?? []) {
      if (link.last_status === 'finished' && link.last_finish_notified_at) continue
      try {
        results.push(await syncLink(link))
      } catch (error) {
        results.push({ id: link.id, error: error?.message ?? 'sync failed' })
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
