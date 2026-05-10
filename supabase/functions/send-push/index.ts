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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { type, matchId } = await req.json()
    if (!matchId) throw new Error('matchId requerido')

    const { data: match, error: matchError } = await supabase
      .from('v_matches')
      .select('*')
      .eq('id', matchId)
      .single()

    if (matchError) throw matchError

    const teamIds = [match.home_team_id, match.away_team_id].filter(Boolean)
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .overlaps('favorite_team_ids', teamIds)

    if (subError) throw subError

    const title = type === 'fixture_updated' ? 'Fixture actualizado' : 'Resultado final'
    const body = type === 'fixture_updated'
      ? `${match.home_team_short_name ?? match.home_team_name} vs ${match.away_team_short_name ?? match.away_team_name}`
      : `${match.home_team_short_name ?? match.home_team_name} ${match.home_score ?? '-'} - ${match.away_score ?? '-'} ${match.away_team_short_name ?? match.away_team_name}`

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

    return new Response(JSON.stringify({
      ok: true,
      sent: results.filter((result) => result.status === 'fulfilled').length,
      failed: results.filter((result) => result.status === 'rejected').length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
