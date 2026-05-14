export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    return res.status(500).json({ ok: false, error: 'Supabase env vars missing' })
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/sync-locos-live`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ limit: 30 }),
  })

  const payload = await response.json().catch(() => ({}))
  return res.status(response.ok ? 200 : 500).json(payload)
}
