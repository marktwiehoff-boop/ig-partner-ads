// Live schalten oder pausieren. Live schalten nur nach ausdrücklicher
// Bestätigung durch admin oder expansion. Jede Entscheidung wird protokolliert.

import { handler, json, HttpFehler } from './lib/antwort.mjs'
import { nutzerPruefen } from './lib/auth.mjs'
import { serviceClient, pruefe } from './lib/supabase.mjs'
import { metaKonfig, graph, setzeStatus } from './lib/meta.mjs'
import { lageDerRegion, metaAnzeigenIds } from './lib/lage.mjs'
import { liveSperren, gesamtSchutzGrund } from '../../shared/budget.js'

export async function schalten({ user, body }, deps = {}) {
  const g = deps.graph || graph
  const cfg = deps.cfg || metaKonfig()
  const lageLaden = deps.lageDerRegion || lageDerRegion
  const sb = serviceClient()
  const { region_id: regionId, aktion, bestaetigt, kommentar } = body || {}
  if (!['live', 'pause'].includes(aktion)) throw new HttpFehler(400, 'Unbekannte Aktion.')

  const lage = await lageLaden(regionId)
  const k = lage.kampagne
  if (!k?.meta_campaign_id) throw new HttpFehler(409, 'Für diese Region gibt es noch keine Kampagne bei Meta.')

  if (aktion === 'pause') {
    await setzeStatus(cfg, k.meta_campaign_id, 'PAUSED', { fetchFn: deps.fetchFn })
    pruefe(await sb.from('ads_approvals').insert({
      art: 'kampagne_pause', objekt_id: k.id, entscheidung: 'freigegeben', kommentar, user_id: user.id,
    }), 'Protokoll')
    pruefe(await sb.from('ads_campaigns').update({ status: 'pausiert', updated_at: new Date().toISOString() }).eq('id', k.id), 'Status speichern')
    return { status: 'pausiert' }
  }

  // Live schalten
  if (bestaetigt !== true) throw new HttpFehler(400, 'Live schalten braucht deine ausdrückliche Bestätigung.')
  const adset = await g(cfg, 'GET', k.meta_adset_id, { fields: 'daily_budget,status' })
  const freigegeben = lage.anzeigen.filter((a) => a.status === 'freigegeben')
  const gesperrt = lage.anzeigen.filter((a) => a.status !== 'freigegeben')
  const gruende = liveSperren({
    region: lage.region,
    kampagne: k,
    ausgabenMonatEur: lage.ausgabenRegion,
    metaTagesbudgetCent: adset.daily_budget != null ? Number(adset.daily_budget) : null,
    anzahlAnzeigen: freigegeben.length,
  })
  const gesamt = gesamtSchutzGrund({ ausgabenGesamtEur: lage.ausgabenGesamt, gesamtObergrenzeEur: lage.einst.gesamt_obergrenze_eur })
  if (gesamt) gruende.push(gesamt)
  if (gruende.length) return { status: k.status, gesperrt: gruende }

  pruefe(await sb.from('ads_approvals').insert({
    art: 'kampagne_live', objekt_id: k.id, entscheidung: 'freigegeben', kommentar, user_id: user.id,
    details: {
      tagesbudget_cent: Number(adset.daily_budget),
      monatsbudget_eur: lage.region.monatsbudget_eur,
      ausgaben_monat_eur: lage.ausgabenRegion,
      anzeigen: freigegeben.map((a) => a.id),
    },
  }), 'Protokoll')

  // Nicht mehr freigegebene Anzeigen bleiben aus, freigegebene gehen an.
  // Die Kampagne kommt zuletzt, damit vorher nichts ausgespielt wird.
  for (const a of gesperrt) for (const id of metaAnzeigenIds(a)) await setzeStatus(cfg, id, 'PAUSED', { fetchFn: deps.fetchFn })
  for (const a of freigegeben) for (const id of metaAnzeigenIds(a)) await setzeStatus(cfg, id, 'ACTIVE', { fetchFn: deps.fetchFn })
  await setzeStatus(cfg, k.meta_adset_id, 'ACTIVE', { fetchFn: deps.fetchFn })
  await setzeStatus(cfg, k.meta_campaign_id, 'ACTIVE', { fetchFn: deps.fetchFn })

  pruefe(await sb.from('ads_campaigns').update({
    status: 'live', live_seit: k.live_seit || new Date().toISOString(), letzter_fehler: null, updated_at: new Date().toISOString(),
  }).eq('id', k.id), 'Status speichern')
  return { status: 'live', anzeigen: freigegeben.length }
}

export default handler(async (req) => {
  if (req.method !== 'POST') throw new HttpFehler(405, 'Nur POST.')
  const { user } = await nutzerPruefen(req)
  const body = await req.json().catch(() => ({}))
  return json(200, await schalten({ user, body }))
})
