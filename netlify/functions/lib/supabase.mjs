import { createClient } from '@supabase/supabase-js'

let client

/** Server-Client mit service_role. Umgeht RLS, deshalb nur nach Rollenprüfung nutzen. */
export function serviceClient() {
  if (client) return client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt in Netlify.')
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return client
}

/** Wirft mit verständlicher Meldung, wenn Supabase einen Fehler meldet. */
export function pruefe({ data, error }, was) {
  if (error) throw new Error(`${was}: ${error.message}`)
  return data
}
