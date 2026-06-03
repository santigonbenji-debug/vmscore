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

    if (!roles?.length) return json({ ok: false, error: 'Solo el superadmin puede crear accesos.' }, 403)

    const { organizationId, email, password } = await req.json()
    const normalizedEmail = String(email ?? '').trim().toLowerCase()
    if (!organizationId || !normalizedEmail || !String(password ?? '')) {
      return json({ ok: false, error: 'Organizacion, email y contraseña son obligatorios.' }, 400)
    }
    if (String(password).length < 12) {
      return json({ ok: false, error: 'La contraseña debe tener al menos 12 caracteres.' }, 400)
    }

    const { data: organization } = await supabase
      .from('organizations')
      .select('id, name, status')
      .eq('id', organizationId)
      .maybeSingle()

    if (!organization || organization.status !== 'active') {
      return json({ ok: false, error: 'La organizacion debe estar activa para crear accesos.' }, 400)
    }

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: String(password),
      email_confirm: true,
      user_metadata: { organization_id: organization.id, organization_name: organization.name },
    })
    if (createError || !created.user) {
      return json({ ok: false, error: createError?.message ?? 'No se pudo crear el usuario.' }, 400)
    }

    const { error: roleError } = await supabase.from('admin_roles').insert({
      user_id: created.user.id,
      role: 'organization_admin',
      organization_id: organization.id,
      status: 'active',
    })

    if (roleError) {
      await supabase.auth.admin.deleteUser(created.user.id)
      throw roleError
    }

    return json({
      ok: true,
      email: normalizedEmail,
      organization: organization.name,
      role: 'organization_admin',
    })
  } catch (error) {
    return json({ ok: false, error: error.message ?? 'No se pudo crear el acceso.' }, 500)
  }
})
