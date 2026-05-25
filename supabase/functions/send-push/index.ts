import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@vmscore.app'
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function authorizeSender(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return false
  if (token === serviceRoleKey) return true

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) return false

  const { data: admin } = await supabase
    .from('admin_roles')
    .select('id')
    .eq('user_id', userData.user.id)
    .eq('role', 'superadmin')
    .eq('status', 'active')
    .maybeSingle()
  return Boolean(admin)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!(await authorizeSender(req))) {
      return new Response(JSON.stringify({ ok: false, error: 'No autorizado.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { type, matchId, title: customTitle, body: customBody, targetTeamIds } = await req.json()
    if (!matchId) throw new Error('matchId requerido')

    const { data: match, error: matchError } = await supabase
      .from('v_matches')
      .select('*')
      .eq('id', matchId)
      .single()

    if (matchError) throw matchError

    const allowedTeamIds = [match.home_team_id, match.away_team_id].filter(Boolean)
    const requestedTeamIds = Array.isArray(targetTeamIds)
      ? targetTeamIds.filter((teamId) => allowedTeamIds.includes(teamId))
      : []
    const teamIds = requestedTeamIds.length > 0 ? requestedTeamIds : allowedTeamIds

    const filters = [`favorite_team_ids.ov.{${teamIds.join(',')}}`]
    if (match.league_id) filters.push(`favorite_league_ids.cs.{${match.league_id}}`)
    if (match.organization_id) filters.push(`favorite_organization_ids.cs.{${match.organization_id}}`)

    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .or(filters.join(','))

    if (subError) throw subError

    const versus = `${match.home_team_short_name ?? match.home_team_name} vs ${match.away_team_short_name ?? match.away_team_name}`
    const result = `${match.home_team_short_name ?? match.home_team_name} ${match.home_score ?? '-'} - ${match.away_score ?? '-'} ${match.away_team_short_name ?? match.away_team_name}`
    const defaultTitleByType: Record<string, string> = {
      fixture_updated: 'Fixture actualizado',
      match_started: 'Inicio del partido',
      match_goal: 'Gol en el partido',
      match_finished_live: 'Finalizo el partido',
      match_finished: 'Resultado final',
    }
    const title = customTitle || defaultTitleByType[type] || 'VMScore'
    const body = customBody || (type === 'fixture_updated' || type === 'match_started' ? versus : result)

    const payload = JSON.stringify({
      title,
      body,
      url: `/partido/${match.id}`,
    })

    const results = await Promise.allSettled((subscriptions ?? []).map((subscription) =>
      webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      }, payload)
    ))

    const expired = results
      .map((result, index) => ({ result, subscription: subscriptions?.[index] }))
      .filter(({ result }) => result.status === 'rejected' && [404, 410].includes(result.reason?.statusCode))
      .map(({ subscription }) => subscription?.endpoint)
      .filter(Boolean)

    if (expired.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', expired)
    }

    const failures = results
      .filter((result) => result.status === 'rejected' && ![404, 410].includes(result.reason?.statusCode))
      .map((result) => result.reason?.message ?? 'No se pudo entregar la notificacion.')
    const sent = results.filter((result) => result.status === 'fulfilled').length
    const ok = failures.length === 0

    return new Response(JSON.stringify({
      ok,
      recipients: subscriptions?.length ?? 0,
      sent,
      expired: expired.length,
      failed: failures.length,
      errors: failures.slice(0, 3),
    }), {
      status: ok ? 200 : 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
