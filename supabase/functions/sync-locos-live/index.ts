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
  if (!response.ok) throw new Error(`Locos VM ${response.status}`)
  const document = await response.json()
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
  await fetch(`${supabaseUrl}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ type, matchId: match.id, title, body }),
  }).catch(() => null)
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
      provider: 'locos_vm',
      external_match_id: link.external_match_id,
      event_key: 'match-started',
      event_type: 'start',
      minute: minute ?? 0,
      home_score: nextHome,
      away_score: nextAway,
      title: 'Inicio del partido',
      raw,
    })
  }

  const detectedGoals = nextHome !== null && nextAway !== null
    ? goalEvents({ match, link, previousHome, previousAway, nextHome, nextAway, minute, raw })
    : []
  events.push(...detectedGoals)

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
      raw,
    })
  }

  if (events.length > 0) {
    const { error } = await supabase
      .from('live_sync_events')
      .upsert(events, { onConflict: 'match_id,provider,event_key', ignoreDuplicates: true })
    if (error) throw error
  }

  const { error: updateError } = await supabase
    .from('match_live_links')
    .update({
      last_external_state: raw,
      last_status: status,
      last_period: raw.period ?? null,
      last_minute: minute,
      last_second: second,
      last_home_score: nextHome,
      last_away_score: nextAway,
      last_synced_at: now,
      last_start_notified_at: startedNow ? now : link.last_start_notified_at,
      last_finish_notified_at: finishedNow ? now : link.last_finish_notified_at,
      updated_at: now,
    })
    .eq('id', link.id)
  if (updateError) throw updateError

  if (startedNow) await sendPush(match, 'match_started', 'Inicio del partido', `${teamName(match, 'home')} vs ${teamName(match, 'away')}`)
  if (detectedGoals.length > 0) {
    const lastGoal = detectedGoals[detectedGoals.length - 1]
    await sendPush(match, 'match_goal', String(lastGoal.title), scoreText(match, nextHome, nextAway))
  }
  if (finishedNow) await sendPush(match, 'match_finished_live', 'Finalizo el partido', scoreText(match, nextHome, nextAway))

  return { id: link.id, events: events.length, status }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}))
    const limit = Math.min(Number(body.limit ?? 20), 50)
    const { data: links, error } = await supabase
      .from('match_live_links')
      .select('*')
      .eq('provider', 'locos_vm')
      .eq('enabled', true)
      .limit(limit)

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
