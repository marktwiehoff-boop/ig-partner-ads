// Holt die Meta-Kennzahlen der letzten Tage in ads_metrics_daily und
// pausiert zum Schutz, wenn Budget oder Obergrenze erreicht sind.
// Pausieren senkt Ausgaben und braucht deshalb keine Freigabe.

import { serviceClient, pruefe } from './supabase.mjs'
import { metaKonfig, graphAlle, setzeStatus } from './meta.mjs'
import { ausgabenMonat } from './lage.mjs'
import { leadsAusAktionen } from '../../../shared/meta-payload.js'
import { schutzpauseGrund, gesamtSchutzGrund } from '../../../shared/budget.js'

const TAGE_ZURUECK = 3 // Meta korrigiert Zahlen der Vortage nachträglich

function tag(d) {
  return d.toISOString().slice(0, 10)
}

export async function kennzahlenAbholen({ heute = new Date(), deps = {} } = {}) {
  const sb = serviceClient()
  const cfg = deps.cfg || metaKonfig()
  const alle = deps.graphAlle || graphAlle
  const status = deps.setzeStatus || setzeStatus

  const seit = new Date(heute.getTime() - TAGE_ZURUECK * 86400000)
  const zeilen = await alle(cfg, `${cfg.konto}/insights`, {
    level: 'ad',
    fields: 'ad_id,campaign_id,spend,impressions,clicks,actions',
    time_range: { since: tag(seit), until: tag(heute) },
    time_increment: 1,
    limit: 500,
  })

  const kampagnen = pruefe(await sb.from('ads_campaigns').select('*'), 'Kampagnen laden')
  const creatives = pruefe(
    await sb.from('ads_creatives').select('id, region_id, meta_ad_id, meta_video_ad_id').or('meta_ad_id.not.is.null,meta_video_ad_id.not.is.null'),
    'Anzeigen laden',
  )
  const regionJeKampagne = Object.fromEntries(kampagnen.filter((k) => k.meta_campaign_id).map((k) => [k.meta_campaign_id, k.region_id]))
  const creativeJeAd = {}
  for (const c of creatives) for (const id of [c.meta_ad_id, c.meta_video_ad_id]) if (id) creativeJeAd[id] = c

  const daten = zeilen.map((z) => ({
    datum: z.date_start,
    meta_ad_id: z.ad_id,
    region_id: regionJeKampagne[z.campaign_id] || creativeJeAd[z.ad_id]?.region_id || null,
    creative_id: creativeJeAd[z.ad_id]?.id || null,
    ausgaben_eur: Number(z.spend || 0),
    impressionen: Number(z.impressions || 0),
    klicks: Number(z.clicks || 0),
    leads_meta: leadsAusAktionen(z.actions),
    abgeholt_am: new Date().toISOString(),
  }))
  if (daten.length) pruefe(await sb.from('ads_metrics_daily').upsert(daten, { onConflict: 'datum,meta_ad_id' }), 'Kennzahlen speichern')

  // Schutzpausen
  const regionen = pruefe(await sb.from('ads_regions').select('*'), 'Regionen laden')
  const einst = pruefe(await sb.from('ads_einstellungen').select('*').eq('id', true).single(), 'Einstellungen laden')
  const ausgaben = await (deps.ausgabenMonat || ausgabenMonat)(heute)
  const gesamtGrund = gesamtSchutzGrund({ ausgabenGesamtEur: ausgaben.gesamt, gesamtObergrenzeEur: einst.gesamt_obergrenze_eur })
  const pausiert = []
  for (const k of kampagnen.filter((x) => x.status === 'live' && x.meta_campaign_id)) {
    const region = regionen.find((r) => r.id === k.region_id)
    const grund = gesamtGrund || schutzpauseGrund({ region, ausgabenMonatEur: ausgaben.jeRegion[k.region_id] || 0, tagesbudgetCent: k.tagesbudget_cent })
    if (!grund) continue
    await status(cfg, k.meta_campaign_id, 'PAUSED')
    pruefe(await sb.from('ads_campaigns').update({ status: 'pausiert', letzter_fehler: `Schutzpause: ${grund}`, updated_at: new Date().toISOString() }).eq('id', k.id), 'Schutzpause speichern')
    pruefe(await sb.from('ads_protokoll').insert({ ereignis: 'schutzpause', region_id: k.region_id, details: { grund, ausgaben_monat_eur: ausgaben.jeRegion[k.region_id] || 0 } }), 'Protokoll')
    pausiert.push({ region: region?.name, grund })
  }

  pruefe(await sb.from('ads_protokoll').insert({ ereignis: 'kennzahlen_abgeholt', details: { zeilen: daten.length, seit: tag(seit), pausiert } }), 'Protokoll')
  return { zeilen: daten.length, pausiert }
}
