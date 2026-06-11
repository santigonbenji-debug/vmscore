import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, serviceRoleKey)

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Metodo no permitido.' }, 405)

  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return json({ ok: false, error: 'Sesion requerida.' }, 401)

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return json({ ok: false, error: 'Sesion invalida.' }, 401)

    const { data: roles, error: roleLookupError } = await supabase
      .from('admin_roles')
      .select('id')
      .eq('user_id', authData.user.id)
      .eq('role', 'superadmin')
      .eq('status', 'active')
      .limit(1)

    if (roleLookupError) {
      return json({ ok: false, error: `No se pudo validar el superadmin: ${roleLookupError.message}` }, 500)
    }

    if (!roles?.length) return json({ ok: false, error: 'Solo el superadmin puede crear moderadores.' }, 403)

    const { leagueId, leagueIds, email, password, displayName } = await req.json()
    const normalizedEmail = String(email ?? '').trim().toLowerCase()
    const normalizedName = String(displayName ?? '').trim()
    const selectedLeagueIds = Array.from(new Set(
      (Array.isArray(leagueIds) ? leagueIds : [leagueId]).filter(Boolean).map((id) => String(id)),
    ))
    if (selectedLeagueIds.length === 0 || !normalizedEmail || !String(password ?? '') || !normalizedName) {
      return json({ ok: false, error: 'Nombre, ligas, email y contrasena son obligatorios.' }, 400)
    }
    if (String(password).length < 12) {
      return json({ ok: false, error: 'La contrasena debe tener al menos 12 caracteres.' }, 400)
    }

    const { data: leagues } = await supabase
      .from('leagues')
      .select('id, name, approval_status, is_archived, organizations(status)')
      .in('id', selectedLeagueIds)

    if (!leagues || leagues.length !== selectedLeagueIds.length || leagues.some((league) => (
      league.approval_status !== 'approved' || league.is_archived || league.organizations?.status !== 'active'
    ))) {
      return json({ ok: false, error: 'Todas las ligas deben estar activas y aprobadas para crear el acceso.' }, 400)
    }

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: String(password),
      email_confirm: true,
      user_metadata: { display_name: normalizedName, moderator_league_ids: selectedLeagueIds },
    })
    if (createError || !created.user) {
      return json({ ok: false, error: createError?.message ?? 'No se pudo crear el usuario.' }, 400)
    }

    const { error: roleError } = await supabase.from('admin_roles').insert(
      leagues.map((league) => ({
        user_id: created.user.id,
        role: 'match_moderator',
        league_id: league.id,
        email: normalizedEmail,
        display_name: normalizedName,
        status: 'active',
      })),
    )

    if (roleError) {
      await supabase.auth.admin.deleteUser(created.user.id)
      throw roleError
    }

    return json({
      ok: true,
      email: normalizedEmail,
      displayName: normalizedName,
      leagues: leagues.map((league) => league.name),
      role: 'match_moderator',
    })
  } catch (error) {
    return json({ ok: false, error: error.message ?? 'No se pudo crear el acceso.' }, 500)
  }
})
