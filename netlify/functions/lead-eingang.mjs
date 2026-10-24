// Lead-Eingang vom Erfolgscheck (Bauplan 3D, Phase 2). Die Landingpage oder
// n8n ruft diese Adresse auf, sobald jemand den Erfolgscheck abgeschlossen
// hat. Die App ordnet den Lead über die UTM-Parameter Region, Anzeige und
// Motiv zu, speichert ihn und meldet gute Leads an Meta zurück.
//
// POST /.netlify/functions/lead-eingang
// Header: x-lead-secret: <LEAD_WEBHOOK_SECRET>
// Body (JSON): {
//   externe_id, email, score (0-100), utm_campaign (Region-Slug),
//   utm_content (Motiv), utm_term (Anzeigen-ID), fbp, fbc, event_time,
//   client_ip, user_agent, event_source_url
// }

import { timingSafeEqual } from 'node:crypto'
import { handler, json, HttpFehler } from './lib/antwort.mjs'
import { serviceClient, pruefe } from './lib/supabase.mjs'
import { metaKonfig } from './lib/meta.mjs'
import { stufeAus, sendeQualifiedLead } from './lib/conversions.mjs'
import { MOTIV_SCHLUESSEL } from '../../shared/motive.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function geheimnisOk(req) {
  const soll = process.env.LEAD_WEBHOOK_SECRET || ''
  const ist = req.headers.get('x-lead-secret') || ''
  if (!soll) throw new HttpFehler(500, 'LEAD_WEBHOOK_SECRET fehlt in Netlify.')
  return ist.length === soll.length && timingSafeEqual(Buffer.from(ist), Buffer.from(soll))
}

export async function leadVerarbeiten(body, deps = {}) {
  const sb = serviceClient()
  const einst = pruefe(await sb.from('ads_einstellungen').select('*').eq('id', true).single(), 'Einstellungen laden')
  const score = body.score == null ? null : Number(body.score)
  if (score != null && (Number.isNaN(score) || score < 0 || score > 100)) throw new HttpFehler(400, 'score muss zwischen 0 und 100 liegen.')

  const region = body.utm_campaign
    ? pruefe(await sb.from('ads_regions').select('id, slug').eq('slug', String(body.utm_campaign).toLowerCase()).maybeSingle(), 'Region')
    : null
  const creative = body.utm_term && UUID.test(body.utm_term)
    ? pruefe(await sb.from('ads_creatives').select('id, motiv, region_id').eq('id', body.utm_term).maybeSingle(), 'Anzeige')
    : null
  const motiv = MOTIV_SCHLUESSEL.includes(body.utm_content) ? body.utm_content : creative?.motiv || null
  const stufe = stufeAus(score, einst.gute_lead_schwelle)

  const zeile = {
    externe_id: body.externe_id ? String(body.externe_id) : null,
    region_id: region?.id || creative?.region_id || null,
    creative_id: creative?.id || null,
    motiv,
    utm_campaign: body.utm_campaign || null,
    utm_content: body.utm_content || null,
    score,
    stufe,
    erstellt_am: body.event_time ? new Date(body.event_time).toISOString() : new Date().toISOString(),
  }
  const gespeichert = zeile.externe_id
    ? pruefe(await sb.from('ads_leads').upsert(zeile, { onConflict: 'externe_id' }).select().single(), 'Lead speichern')
    : pruefe(await sb.from('ads_leads').insert(zeile).select().single(), 'Lead speichern')

  let gemeldet = false
  if (stufe === 'hoch' && !gespeichert.meta_gemeldet_am) {
    try {
      const cfg = deps.cfg || metaKonfig()
      await (deps.senden || sendeQualifiedLead)(cfg, { ...body, score, stufe },
        { regionSlug: region?.slug, motiv, quelleUrl: body.event_source_url || einst.landingpage_url }, { fetchFn: deps.fetchFn })
      pruefe(await sb.from('ads_leads').update({ meta_gemeldet_am: new Date().toISOString() }).eq('id', gespeichert.id), 'Meldung merken')
      gemeldet = true
    } catch (e) {
      // Der Lead ist gespeichert, die Rückmeldung an Meta kann später nachgeholt werden.
      await sb.from('ads_protokoll').insert({ ereignis: 'lead_meldung_fehler', region_id: zeile.region_id, details: { lead_id: gespeichert.id, fehler: e.message } })
    }
  }
  return { lead_id: gespeichert.id, region: region?.slug || null, motiv, stufe, meta_gemeldet: gemeldet }
}

export default handler(async (req) => {
  if (req.method !== 'POST') throw new HttpFehler(405, 'Nur POST.')
  if (!geheimnisOk(req)) throw new HttpFehler(401, 'Falsches Geheimnis.')
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') throw new HttpFehler(400, 'JSON-Body fehlt.')
  return json(200, await leadVerarbeiten(body))
})
