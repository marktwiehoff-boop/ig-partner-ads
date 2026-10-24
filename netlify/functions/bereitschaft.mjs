// Bereitschaft: Was fehlt noch, damit die Partnersuche in der Produktion von
// allein läuft? Zeigt nur Ja/Nein je Punkt, nie Werte von Schlüsseln.

import { handler, json, HttpFehler } from './lib/antwort.mjs'
import { nutzerPruefen } from './lib/auth.mjs'
import { serviceClient } from './lib/supabase.mjs'

const META_SCHLUESSEL = ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_PAGE_ID', 'META_PIXEL_ID']

export async function bereitschaftErmitteln({ env = process.env, jetzt = Date.now() } = {}) {
  const sb = serviceClient()
  const punkte = []
  const punkt = (schluessel, ok, text, hilfe) => punkte.push({ schluessel, ok: Boolean(ok), text, hilfe: ok ? null : hilfe })

  const lauf = await sb.from('ads_autopilot_lauf').select('*').eq('id', true).maybeSingle()
  const datenbankOk = !lauf.error
  punkt('datenbank', datenbankOk, 'Datenbank auf dem Stand (Autopilot-Nachtrag 0007)',
    'In Netlify SUPABASE_DB_URL setzen und einen Deploy auslösen (README, Schritt 1.5). Oder supabase/migrations/0007_autopilot.sql im Supabase SQL-Editor ausführen.')

  const letzter = lauf.data?.letzter_lauf ? new Date(lauf.data.letzter_lauf).getTime() : null
  const minuten = letzter ? Math.round((jetzt - letzter) / 60000) : null
  punkt('zeitplan', datenbankOk && minuten != null && minuten <= 20,
    minuten == null ? 'Autopilot-Zeitplan: noch kein Lauf' : `Autopilot-Zeitplan läuft (zuletzt vor ${minuten} Min.)`,
    datenbankOk ? 'Der 15-Minuten-Takt läuft nur im Produktions-Deploy von Netlify. Prüfe unter Netlify, Functions, autopilot-tick, ob er aufgerufen wird.' : 'Kommt von allein, sobald die Datenbank auf dem Stand ist.')

  punkt('igwissen', env.IGWISSEN_TOKEN, 'IG-Wissen angebunden (IGWISSEN_TOKEN)', 'GitHub-Token mit Leserecht auf igwissen in Netlify als IGWISSEN_TOKEN setzen (README, Schritt 4).')
  punkt('claude', env.ANTHROPIC_API_KEY, 'Claude angebunden (ANTHROPIC_API_KEY)', 'ANTHROPIC_API_KEY in Netlify setzen.')
  punkt('higgsfield', env.HF_CREDENTIALS, 'Higgsfield angebunden (HF_CREDENTIALS)', 'HF_CREDENTIALS im Format KEY_ID:KEY_SECRET in Netlify setzen.')

  const metaFehlt = META_SCHLUESSEL.filter((k) => !env[k])
  punkt('meta', metaFehlt.length === 0, metaFehlt.length ? `Meta-Schlüssel fehlen: ${metaFehlt.join(', ')}` : 'Meta angebunden',
    'Meta-Schlüssel in Netlify setzen (README, Schritt 3). Bis dahin bereitet die App Anzeigen vor, die Kampagne wartet.')
  punkt('lead', env.LEAD_WEBHOOK_SECRET, 'Lead-Eingang gesichert (LEAD_WEBHOOK_SECRET)',
    'LEAD_WEBHOOK_SECRET in Netlify setzen und dasselbe Geheimnis im Erfolgscheck hinterlegen (README, Schritt 7). Ohne ihn lernt die App nicht aus Leads.')

  const regionen = await sb.from('ads_regions').select('id, name, autopilot, aktiv').eq('aktiv', true)
  const laufend = (regionen.data || []).filter((r) => r.autopilot)
  punkt('regionen', laufend.length > 0,
    laufend.length ? `Partnersuche läuft in: ${laufend.map((r) => r.name).join(', ')}` : 'Noch keine Region mit laufender Partnersuche',
    'Unter Regionen bei einer Region auf „Partnersuche starten“ klicken. Das ist der eine Klick, den nur ein Mensch macht.')

  const bereit = punkte.filter((p) => ['datenbank', 'igwissen', 'claude', 'higgsfield', 'meta'].includes(p.schluessel)).every((p) => p.ok)
  return { bereit, punkte, letzter_lauf: lauf.data?.letzter_lauf || null, laeuft_seit: lauf.data?.laeuft_seit || null }
}

export default handler(async (req) => {
  if (req.method !== 'GET') throw new HttpFehler(405, 'Nur GET.')
  await nutzerPruefen(req, ['admin', 'expansion', 'viewer'])
  return json(200, await bereitschaftErmitteln())
})
