import { serviceClient } from './supabase.mjs'
import { HttpFehler } from './antwort.mjs'

export const BEDIENER = ['admin', 'expansion']

/**
 * Prüft den Login (Bearer-Token aus Supabase) und die Rolle in ads_users.
 * Gibt { user, rolle } zurück oder wirft 401/403.
 */
export async function nutzerPruefen(req, erlaubteRollen = BEDIENER) {
  const kopf = req.headers.get('authorization') || ''
  const token = kopf.startsWith('Bearer ') ? kopf.slice(7) : null
  if (!token) throw new HttpFehler(401, 'Bitte melde dich an.')

  const sb = serviceClient()
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data?.user) throw new HttpFehler(401, 'Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.')

  const { data: zeile } = await sb.from('ads_users').select('rolle, email, name').eq('id', data.user.id).maybeSingle()
  if (!zeile) throw new HttpFehler(403, 'Du bist für IG Partner-Ads noch nicht freigeschaltet.')
  if (!erlaubteRollen.includes(zeile.rolle)) {
    throw new HttpFehler(403, 'Dafür brauchst du die Rolle Admin oder Expansion.')
  }
  return { user: data.user, rolle: zeile.rolle, email: zeile.email }
}
