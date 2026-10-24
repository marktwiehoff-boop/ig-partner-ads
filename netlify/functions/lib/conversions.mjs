// Meta Conversions API: gute Leads als eigenes Ereignis "QualifiedLead"
// zurückmelden, damit Meta ähnliche Interessenten findet (Bauplan 3D).

import { createHash } from 'node:crypto'
import { graph } from './meta.mjs'

export function hash(wert) {
  if (!wert) return null
  return createHash('sha256').update(String(wert).trim().toLowerCase()).digest('hex')
}

/** Stufe aus dem Erfolgscheck-Score: hoch ab Schwelle, mittel ab 40, sonst niedrig. */
export function stufeAus(score, schwelle = 70) {
  if (score == null || Number.isNaN(Number(score))) return null
  const s = Number(score)
  if (s >= schwelle) return 'hoch'
  if (s >= 40) return 'mittel'
  return 'niedrig'
}

export function ereignis(lead, { regionSlug, motiv, quelleUrl }) {
  const user_data = {}
  const em = hash(lead.email)
  if (em) user_data.em = [em]
  if (lead.fbp) user_data.fbp = lead.fbp
  if (lead.fbc) user_data.fbc = lead.fbc
  if (lead.client_ip) user_data.client_ip_address = lead.client_ip
  if (lead.user_agent) user_data.client_user_agent = lead.user_agent
  return {
    event_name: 'QualifiedLead',
    event_time: Math.floor((lead.event_time ? new Date(lead.event_time).getTime() : Date.now()) / 1000),
    event_id: lead.externe_id || undefined,
    action_source: 'website',
    event_source_url: quelleUrl || undefined,
    user_data,
    custom_data: { score: Number(lead.score), stufe: lead.stufe, region: regionSlug || '', motiv: motiv || '' },
  }
}

export async function sendeQualifiedLead(cfg, lead, kontext, { fetchFn = fetch } = {}) {
  const werte = { data: [ereignis(lead, kontext)] }
  if (process.env.META_TEST_EVENT_CODE) werte.test_event_code = process.env.META_TEST_EVENT_CODE
  return graph(cfg, 'POST', `${cfg.pixelId}/events`, werte, { fetchFn })
}
