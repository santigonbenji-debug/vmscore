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

function asNumber(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const hoursAhead = Math.max(1, Math.min(48, asNumber(body.hoursAhead, 24)))
    const now = new Date()
    const until = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000)

    const { data: matches, error: matchError } = await supabase
      .from('v_matches')
      .select('*')
      .eq('status', 'scheduled')
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', until.toISOString())
      .order('scheduled_at', { ascending: true })

    if (matchError) throw matchError

    let sent = 0
    let skipped = 0
    let failed = 0
    const expired: string[] = []

    for (const match of matches ?? []) {
      const teamIds = [match.home_team_id, match.away_team_id].filter(Boolean)
      if (teamIds.length === 0) continue

      const { data: subscriptions, error: subError } = await supabase
        .from('push_subscriptions')
        .select('*')
        .overlaps('favorite_team_ids', teamIds)

      if (subError) throw subError

      for (const subscription of subscriptions ?? []) {
        const { error: deliveryError } = await supabase
          .from('push_notification_deliveries')
          .insert({
            subscription_id: subscription.id,
            match_id: match.id,
            notification_type: 'match_reminder',
          })

        if (deliveryError) {
          skipped += 1
          continue
        }

        const startsAt = new Intl.DateTimeFormat('es-AR', {
          timeZone: 'America/Argentina/San_Luis',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(match.scheduled_at))

        const payload = JSON.stringify({
          title: 'Hoy juega tu favorito',
          body: `${match.home_team_short_name ?? match.home_team_name} vs ${match.away_team_short_name ?? match.away_team_name} · ${startsAt}`,
          url: `/partido/${match.id}`,
        })

        try {
          await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          }, payload)
          sent += 1
        } catch (error) {
          failed += 1
          if ([404, 410].includes(error?.statusCode)) {
            expired.push(subscription.endpoint)
          }
        }
      }
    }

    if (expired.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', expired)
    }

    return new Response(JSON.stringify({
      ok: true,
      matches: matches?.length ?? 0,
      sent,
      skipped,
      failed,
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
