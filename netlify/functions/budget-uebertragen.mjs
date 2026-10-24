// Überträgt das Monatsbudget einer Region als Tagesbudget auf die
// Anzeigengruppe bei Meta. Nur nach Bestätigung durch admin oder expansion.
// Der Wert kommt immer aus der Datenbank (dort durch Obergrenzen gesichert),
// nie aus der Anfrage.

import { handler, json, HttpFehler } from './lib/antwort.mjs'
import { nutzerPruefen } from './lib/auth.mjs'
import { serviceClient, pruefe } from './lib/supabase.mjs'
import { metaKonfig, graph } from './lib/meta.mjs'
import { lageDerRegion } from './lib/lage.mjs'
import { tagesbudgetCent } from '../../shared/budget.js'

export async function budgetUebertragen({ user, body }, deps = {}) {
  const g = deps.graph || graph
  const cfg = deps.cfg || metaKonfig()
  const sb = serviceClient()
  if (body?.bestaetigt !== true) throw new HttpFehler(400, 'Budget-Änderungen brauchen deine ausdrückliche Bestätigung.')

  const lage = await (deps.lageDerRegion || lageDerRegion)(body.region_id)
  const k = lage.kampagne
  if (!k?.meta_adset_id) throw new HttpFehler(409, 'Für diese Region gibt es noch keine Anzeigengruppe bei Meta.')

  const neu = tagesbudgetCent(lage.region.monatsbudget_eur)
  const adset = await g(cfg, 'GET', k.meta_adset_id, { fields: 'daily_budget' })
  const alt = Number(adset.daily_budget)
  if (alt === neu) return { tagesbudget_cent: neu, geaendert: false }

  pruefe(await sb.from('ads_approvals').insert({
    art: 'budget', objekt_id: lage.region.id, entscheidung: 'freigegeben', kommentar: body.kommentar, user_id: user.id,
    details: { tagesbudget_alt_cent: alt, tagesbudget_neu_cent: neu, monatsbudget_eur: lage.region.monatsbudget_eur, obergrenze_eur: lage.region.obergrenze_eur },
  }), 'Protokoll')
  await g(cfg, 'POST', k.meta_adset_id, { daily_budget: neu })
  pruefe(await sb.from('ads_campaigns').update({ tagesbudget_cent: neu, updated_at: new Date().toISOString() }).eq('id', k.id), 'Budget speichern')
  return { tagesbudget_cent: neu, vorher_cent: alt, geaendert: true }
}

export default handler(async (req) => {
  if (req.method !== 'POST') throw new HttpFehler(405, 'Nur POST.')
  const { user } = await nutzerPruefen(req)
  const body = await req.json().catch(() => ({}))
  return json(200, await budgetUebertragen({ user, body }))
})
