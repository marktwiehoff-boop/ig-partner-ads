// Background-Function: legt für eine Region Kampagne, Anzeigengruppe und
// Anzeigen bei Meta an. ALLES startet pausiert. Live schaltet nur ein Mensch
// über kampagne-schalten.mjs.

import { backgroundJob } from './lib/jobs.mjs'
import { serviceClient, pruefe } from './lib/supabase.mjs'
import { metaKonfig, graph } from './lib/meta.mjs'
import {
  kampagnePayload, anzeigengruppePayload, bildCreativePayload, videoCreativePayload,
  anzeigePayload, waehleBild, waehleVideo,
} from '../../shared/meta-payload.js'
import { tagesbudgetCent } from '../../shared/budget.js'

async function kampagneSetzen(sb, regionId, felder) {
  const zeile = pruefe(
    await sb.from('ads_campaigns')
      .upsert({ region_id: regionId, ...felder, updated_at: new Date().toISOString() }, { onConflict: 'region_id' })
      .select('*').single(),
    'Kampagne speichern',
  )
  return zeile
}

async function bildHochladen(cfg, url, deps) {
  const r = await deps.fetchFn(url)
  if (!r.ok) throw new Error(`Bild nicht ladbar (HTTP ${r.status}).`)
  const bytes = Buffer.from(await r.arrayBuffer()).toString('base64')
  const antwort = await deps.graph(cfg, 'POST', `${cfg.konto}/adimages`, { bytes })
  const hash = Object.values(antwort.images || {})[0]?.hash
  if (!hash) throw new Error('Meta hat keinen Bild-Hash geliefert.')
  return hash
}

async function videoHochladen(cfg, url, name, deps) {
  const { id } = await deps.graph(cfg, 'POST', `${cfg.konto}/advideos`, { file_url: url, name })
  for (let i = 0; i < 60; i++) {
    const v = await deps.graph(cfg, 'GET', id, { fields: 'status' })
    const s = v.status?.video_status
    if (s === 'ready') return id
    if (s === 'error') throw new Error('Meta konnte den Clip nicht verarbeiten.')
    await deps.schlafen(5000)
  }
  throw new Error('Meta verarbeitet den Clip noch. Starte das Anlegen später erneut.')
}

export async function kampagneAnlegen(job, _user, melden = async () => {}, deps = {}) {
  deps = { fetchFn: fetch, graph, schlafen: (ms) => new Promise((r) => setTimeout(r, ms)), ...deps }
  const sb = serviceClient()
  const cfg = metaKonfig()
  const regionId = job.eingabe?.region_id

  const region = pruefe(await sb.from('ads_regions').select('*').eq('id', regionId).single(), 'Region laden')
  if (!region.aktiv) throw new Error('Die Region ist nicht aktiv.')
  const einst = pruefe(await sb.from('ads_einstellungen').select('*').eq('id', true).single(), 'Einstellungen laden')
  cfg.landingpageUrl = einst.landingpage_url

  const creatives = pruefe(
    await sb.from('ads_creatives').select('*').eq('region_id', regionId).eq('status', 'freigegeben').is('meta_ad_id', null),
    'Anzeigen laden',
  ).filter((c) => waehleBild(c.medien))
  const vorhanden = pruefe(await sb.from('ads_campaigns').select('*').eq('region_id', regionId).maybeSingle(), 'Kampagne laden')
  if (creatives.length === 0 && vorhanden?.meta_adset_id) {
    return { neu: 0, hinweis: 'Keine neuen freigegebenen Anzeigen mit Bild.' }
  }
  if (creatives.length === 0) throw new Error('Es gibt noch keine freigegebene Anzeige mit Bild für diese Region.')

  // Zielgebiet vorab prüfen, damit nichts halb angelegt wird
  anzeigengruppePayload(region, 'pruefung', cfg)

  if (vorhanden?.status === 'wird_angelegt' && Date.now() - new Date(vorhanden.updated_at).getTime() < 15 * 60 * 1000) {
    throw new Error('Für diese Region läuft das Anlegen gerade schon.')
  }
  let k = await kampagneSetzen(sb, regionId, { status: 'wird_angelegt', letzter_fehler: null })
  try {
    if (!k.meta_campaign_id) {
      await melden('Kampagne wird angelegt')
      const { id } = await deps.graph(cfg, 'POST', `${cfg.konto}/campaigns`, kampagnePayload(region, cfg))
      k = await kampagneSetzen(sb, regionId, { meta_campaign_id: id })
    }
    if (!k.meta_adset_id) {
      await melden('Anzeigengruppe mit Umkreis wird angelegt')
      const payload = anzeigengruppePayload(region, k.meta_campaign_id, cfg)
      if (payload.daily_budget > tagesbudgetCent(region.monatsbudget_eur)) throw new Error('Tagesbudget über dem erlaubten Wert.')
      const { id } = await deps.graph(cfg, 'POST', `${cfg.konto}/adsets`, payload)
      k = await kampagneSetzen(sb, regionId, { meta_adset_id: id, tagesbudget_cent: payload.daily_budget })
    }

    let neu = 0
    for (const c of creatives) {
      await melden(`Anzeige ${neu + 1} von ${creatives.length} wird angelegt`)
      const bild = waehleBild(c.medien)
      const hash = await bildHochladen(cfg, bild.url, deps)
      const cr = await deps.graph(cfg, 'POST', `${cfg.konto}/adcreatives`, bildCreativePayload(c, region, hash, cfg))
      const ad = await deps.graph(cfg, 'POST', `${cfg.konto}/ads`, anzeigePayload(`${region.name} | ${c.motiv} | Bild`, k.meta_adset_id, cr.id))
      const felder = { meta_creative_id: cr.id, meta_ad_id: ad.id }

      const video = waehleVideo(c.medien)
      if (video) {
        await melden(`Clip ${neu + 1} wird zu Meta hochgeladen`)
        const videoId = await videoHochladen(cfg, video.url, `${region.name} ${c.id}`, deps)
        const vcr = await deps.graph(cfg, 'POST', `${cfg.konto}/adcreatives`,
          videoCreativePayload(c, region, videoId, video.vorschau || bild.url, cfg))
        const vad = await deps.graph(cfg, 'POST', `${cfg.konto}/ads`, anzeigePayload(`${region.name} | ${c.motiv} | Clip`, k.meta_adset_id, vcr.id))
        felder.meta_video_ad_id = vad.id
      }
      pruefe(await sb.from('ads_creatives').update(felder).eq('id', c.id), 'Meta-IDs speichern')
      neu++
    }

    // Status so übernehmen, wie Meta ihn meldet: neue Anzeigen sind immer
    // pausiert, die Kampagne bleibt, wie ein Mensch sie geschaltet hat.
    const meta = await deps.graph(cfg, 'GET', k.meta_campaign_id, { fields: 'status' })
    const status = meta.status === 'ACTIVE' ? 'live' : 'pausiert'
    await kampagneSetzen(sb, regionId, { status })
    return { neu, kampagne: k.meta_campaign_id, status }
  } catch (e) {
    await kampagneSetzen(sb, regionId, { status: 'fehler', letzter_fehler: e.message }).catch(() => {})
    throw e
  }
}

export default backgroundJob('kampagne_anlegen', (job, user, melden) => kampagneAnlegen(job, user, melden))
