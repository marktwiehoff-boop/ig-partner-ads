// Interne Aufrufe zwischen eigenen Functions (Zeitplan -> Hintergrundarbeit).
// Das Geheimnis wird aus dem Supabase-Serverschlüssel abgeleitet, damit kein
// weiterer Schlüssel in Netlify nötig ist.

import { createHmac, timingSafeEqual } from 'node:crypto'

export function internesGeheimnis() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY fehlt in Netlify.')
  return createHmac('sha256', key).update('ig-partner-ads-intern').digest('hex')
}

export function internGeprueft(req) {
  const kopf = req.headers.get('x-intern') || ''
  const soll = internesGeheimnis()
  return kopf.length === soll.length && timingSafeEqual(Buffer.from(kopf), Buffer.from(soll))
}

export function eigeneAdresse() {
  const u = process.env.AUTOPILOT_BASIS_URL || process.env.URL || process.env.DEPLOY_PRIME_URL
  if (!u) throw new Error('Adresse der eigenen Seite unbekannt (URL fehlt).')
  return u.replace(/\/$/, '')
}

/** Startet eine Hintergrund-Function. Antwortet sofort (202), die Arbeit läuft weiter. */
export async function hintergrundStarten(name, body = {}, fetchFn = fetch) {
  const r = await fetchFn(`${eigeneAdresse()}/.netlify/functions/${name}`, {
    method: 'POST',
    headers: { 'x-intern': internesGeheimnis(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (r.status !== 202 && !r.ok) throw new Error(`Hintergrund-Function ${name} antwortet mit ${r.status}`)
  return r.status
}
