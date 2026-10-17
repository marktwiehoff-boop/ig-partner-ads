import { serviceClient, pruefe } from './supabase.mjs'

export function monatsanfang(heute = new Date()) {
  return new Date(Date.UTC(heute.getUTCFullYear(), heute.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

/** Ausgaben im laufenden Monat je Region und gesamt (aus metrics_daily). */
export async function ausgabenMonat(heute = new Date()) {
  const sb = serviceClient()
  const zeilen = pruefe(
    await sb.from('ads_metrics_daily').select('region_id, ausgaben_eur').gte('datum', monatsanfang(heute)),
    'Ausgaben laden',
  )
  const jeRegion = {}
  let gesamt = 0
  for (const z of zeilen) {
    const b = Number(z.ausgaben_eur || 0)
    gesamt += b
    if (z.region_id) jeRegion[z.region_id] = (jeRegion[z.region_id] || 0) + b
  }
  return { jeRegion, gesamt: Math.round(gesamt * 100) / 100 }
}

/** Alles, was eine Entscheidung über eine Region braucht. */
export async function lageDerRegion(regionId) {
  const sb = serviceClient()
  const region = pruefe(await sb.from('ads_regions').select('*').eq('id', regionId).single(), 'Region laden')
  const kampagne = pruefe(await sb.from('ads_campaigns').select('*').eq('region_id', regionId).maybeSingle(), 'Kampagne laden')
  const einst = pruefe(await sb.from('ads_einstellungen').select('*').eq('id', true).single(), 'Einstellungen laden')
  const anzeigen = pruefe(
    await sb.from('ads_creatives').select('id, status, meta_ad_id, meta_video_ad_id').eq('region_id', regionId)
      .or('meta_ad_id.not.is.null,meta_video_ad_id.not.is.null'),
    'Anzeigen laden',
  )
  const ausgaben = await ausgabenMonat()
  return { region, kampagne, einst, anzeigen, ausgabenRegion: ausgaben.jeRegion[regionId] || 0, ausgabenGesamt: ausgaben.gesamt }
}

export function metaAnzeigenIds(c) {
  return [c.meta_ad_id, c.meta_video_ad_id].filter(Boolean)
}
