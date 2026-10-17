import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const konfiguriert = Boolean(url && key)
export const supabase = konfiguriert ? createClient(url, key) : null
