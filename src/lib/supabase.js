import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las variables de entorno de Supabase. Verificar .env.local')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
