// Ende-zu-Ende: Rick klickt einmal "Partnersuche starten", danach läuft die
// echte App-Logik (Planer, Ausführung, Datenbank-Regeln) gegen ein echtes
// Postgres mit echtem PostgREST. Nur Claude, Higgsfield, Meta und GitHub sind
// Attrappen. Der Lauf druckt einen Bericht und endet mit Fehler, sobald eine
// Prüfung nicht stimmt.  Aufruf: npm run test:e2e

import { createHmac, createHash } from 'node:crypto'
import { starteFakes } from './fakes.mjs'

const FAKE_PORT = Number(process.env.FAKE_PORT || 3012)
const PGRST_URL = process.env.PGRST_URL || 'http://127.0.0.1:3011'
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) throw new Error('JWT_SECRET fehlt (startet über tests/e2e/lauf.sh).')

const RICK = '00000000-0000-0000-0000-00000000000e'
const TEAM = '00000000-0000-0000-0000-00000000000b'

function jwt(payload) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const kopf = b64({ alg: 'HS256', typ: 'JWT' })
  const inhalt = b64({ iss: 'supabase', exp: Math.floor(Date.now() / 1000) + 3600, ...payload })
  return `${kopf}.${inhalt}.${createHmac('sha256', JWT_SECRET).update(`${kopf}.${inhalt}`).digest('base64url')}`
}

const fakes = await starteFakes({ port: FAKE_PORT, pgrstUrl: PGRST_URL, wissenOrdner: process.env.IGWISSEN_ORDNER })
const B = fakes.basis

// Umgebung wie in Netlify, nur mit Attrappen-Adressen. Vor dem Import der App-Module setzen.
Object.assign(process.env, {
  SUPABASE_URL: B,
  SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role' }),
  ANTHROPIC_API_KEY: 'test', ANTHROPIC_BASE_URL: `${B}/anthropic`,
  HF_CREDENTIALS: 'schluessel:geheim', HF_BASIS_URL: `${B}/hf`,
  IGWISSEN_TOKEN: 'token', IGWISSEN_API_URL: `${B}/github`,
  META_ACCESS_TOKEN: 'meta-token', META_AD_ACCOUNT_ID: '123', META_PAGE_ID: 'seite1', META_PIXEL_ID: 'pixel1', META_GRAPH_URL: `${B}/meta`,
  LEAD_WEBHOOK_SECRET: 'lead-geheimnis',
})

const { createClient } = await import('@supabase/supabase-js')
const { autopilotLauf, HINWEIS_META_FEHLT } = await import('../../netlify/functions/lib/autopilot.mjs')
const { schalten } = await import('../../netlify/functions/kampagne-schalten.mjs')
const { default: leadEingang } = await import('../../netlify/functions/lead-eingang.mjs')
const { tagesbudgetCent } = await import('../../shared/budget.js')

const sb = createClient(B, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const als = (uid) => {
  const t = jwt({ sub: uid, role: 'authenticated', email: `${uid.slice(-1)}@test.de` })
  return createClient(B, t, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${t}` } } })
}
const rick = als(RICK)
const team = als(TEAM)

const ergebnisse = []
function pruefe(bedingung, text, detail) {
  ergebnisse.push({ ok: Boolean(bedingung), text })
  console.log(`${bedingung ? '  ok ' : '  FEHLT'} ${text}${!bedingung && detail !== undefined ? `  (${typeof detail === 'string' ? detail : JSON.stringify(detail)})` : ''}`)
}
function abschnitt(t) { console.log(`\n== ${t}`) }
function daten({ data, error }, was) { if (error) throw new Error(`${was}: ${error.message}`); return data }

const berlin = daten(await sb.from('ads_regions').select('*').eq('slug', 'berlin').single(), 'Berlin laden')
const lade = async () => ({
  region: daten(await sb.from('ads_regions').select('*').eq('id', berlin.id).single(), 'Region'),
  kampagne: daten(await sb.from('ads_campaigns').select('*').eq('region_id', berlin.id).maybeSingle(), 'Kampagne'),
  creatives: daten(await sb.from('ads_creatives').select('*').eq('region_id', berlin.id).order('created_at'), 'Anzeigen'),
  approvals: daten(await sb.from('ads_approvals').select('*').order('created_at'), 'Freigaben'),
  protokoll: daten(await sb.from('ads_protokoll').select('*').order('id'), 'Protokoll'),
  lauf: daten(await sb.from('ads_autopilot_lauf').select('*').eq('id', true).single(), 'Lauf'),
})
const metaObjekt = (id) => fakes.meta.objekte.get(id)

try {
  abschnitt('0. Harte Grenzen gelten in der echten Datenbank')
  const r0 = await team.from('ads_regions').update({ autopilot: true }).eq('id', berlin.id).select()
  pruefe(r0.error || r0.data?.length === 0, 'Viewer kann die Partnersuche nicht starten', r0)
  const r1 = await sb.from('ads_regions').update({ autopilot: true }).eq('id', berlin.id)
  pruefe(r1.error && /nur ein Mensch/.test(r1.error.message), 'Der Server allein kann die Partnersuche nicht starten (Trigger verlangt einen Menschen)', r1.error?.message)
  const r2 = await rick.from('ads_regions').update({ monatsbudget_eur: 600 }).eq('id', berlin.id)
  pruefe(r2.error && /Obergrenze/.test(r2.error.message), 'Rick kann das Budget nicht über die Obergrenze heben', r2.error?.message)
  const r3 = await rick.from('ads_regions').update({ obergrenze_eur: 900 }).eq('id', berlin.id)
  pruefe(r3.error && /Admin/.test(r3.error.message), 'Rick kann die Obergrenze nicht ändern', r3.error?.message)

  abschnitt('1. Der eine Klick: Rick startet die Partnersuche für Berlin')
  const start = await rick.from('ads_regions').update({ autopilot: true }).eq('id', berlin.id).select().single()
  pruefe(!start.error && start.data.autopilot === true, 'Partnersuche ist an', start.error?.message)
  pruefe(start.data?.autopilot_von === RICK && start.data?.autopilot_seit, 'Start ist Rick zugerechnet, mit Zeitstempel')
  let l = await lade()
  const startFreigabe = l.approvals.find((a) => a.art === 'kampagne_live' && a.details?.autopilot === true)
  pruefe(startFreigabe && startFreigabe.user_id === RICK, 'Die Freigabe (Budget, Obergrenze, Modus) steht im Freigabeprotokoll', startFreigabe)
  pruefe(startFreigabe?.details?.monatsbudget_eur === 500 && startFreigabe?.details?.obergrenze_eur === 500, 'Freigabe nennt 500 € Monatsbudget und 500 € Obergrenze', startFreigabe?.details)

  abschnitt('2. Ab jetzt keine Klicks mehr: der Autopilot läuft (15-Minuten-Takt simuliert)')
  const heute = new Date()
  let ticks = 0
  let bericht
  for (ticks = 1; ticks <= 6; ticks++) {
    bericht = await autopilotLauf({ heute })
    const schritte = bericht.regionen?.[berlin.id]?.schritte || []
    console.log(`  Lauf ${ticks}: ${schritte.join(' → ') || 'nichts zu tun'}${bericht.fehler ? `  FEHLER ${bericht.fehler}` : ''}`)
    if (bericht.fehler) throw new Error(bericht.fehler)
    l = await lade()
    if (l.kampagne?.status === 'live') break
  }
  pruefe(l.kampagne?.status === 'live', `Kampagne ist live nach ${ticks} Lauf/Läufen`, l.kampagne)
  const frei = l.creatives.filter((c) => c.status === 'freigegeben')
  pruefe(frei.length === 4 && new Set(frei.map((c) => c.motiv)).size === 4, 'Vier Motive, je eine freigegebene Anzeige', l.creatives.map((c) => [c.motiv, c.status]))
  pruefe(frei.every((c) => c.markencheck?.pruefung?.bestanden === true && c.markencheck?.verstoesse?.length === 0), 'Jede freigegebene Anzeige hat die Claude-Prüfung bestanden und keine Markenverstöße')
  pruefe(frei.every((c) => (c.medien || []).filter((m) => m.typ === 'bild').length === 3), 'Jede Anzeige hat drei Bilder (1:1, 3:4, 9:16)', frei.map((c) => c.medien?.length))
  pruefe(frei.every((c) => c.medien.every((m) => m.url.startsWith(`${B}/storage/v1/object/public/ads-medien/`))), 'Bilder liegen dauerhaft im eigenen Speicher, nicht bei Higgsfield')
  pruefe(fakes.log.storage.size === 12, 'Zwölf Dateien im Speicher', fakes.log.storage.size)
  pruefe(fakes.log.higgsfield.length === 12 && fakes.log.higgsfield.every((h) => h.referenz === `${B}/vorlage.jpg`), 'Higgsfield bekam bei jedem Bild das Store-Foto als Vorlage', fakes.log.higgsfield.slice(0, 2))
  pruefe(fakes.log.higgsfield.map((h) => h.aspect_ratio).filter((a) => a === '3:4').length === 4, 'Hochformat als 3:4 angefragt (Soul kennt kein 4:5)')
  pruefe(frei.every((c) => c.freigegeben_von === RICK), 'Freigaben sind Rick zugerechnet (er hat die Partnersuche gestartet)')
  pruefe(frei.every((c) => c.meta_ad_id && c.meta_aktiv === true), 'Jede Anzeige liegt bei Meta und ist aktiv')

  abschnitt('3. Selbstkorrektur: erfundene Zahl wird abgelehnt und neu geschrieben')
  const abgelehnt = l.creatives.filter((c) => c.status === 'abgelehnt')
  pruefe(abgelehnt.length === 1 && abgelehnt[0].motiv === 'zahlen_sicherheit', 'Die Variante mit "200 Stores" wurde abgelehnt', abgelehnt.map((c) => c.hook))
  pruefe(/200 Stores/.test(abgelehnt[0]?.markencheck?.pruefung?.befunde?.[0]?.begruendung || ''), 'Begründung der Ablehnung ist gespeichert')
  const ablehnung = l.approvals.find((a) => a.art === 'creative' && a.entscheidung === 'abgelehnt')
  pruefe(ablehnung?.details?.automatisch === true && /200 Stores/.test(ablehnung.kommentar), 'Ablehnung steht im Freigabeprotokoll als automatisch')
  const zweiterText = fakes.log.texte[1]
  pruefe(zweiterText && zweiterText.motive.join() === 'zahlen_sicherheit' && /Vermeide.*200 Stores/.test(zweiterText.hinweis), 'Zweiter Textauftrag nur für dieses Motiv, mit Korrekturhinweis', zweiterText)
  pruefe(fakes.log.texte.length === 2 && fakes.log.pruefungen.length === 5, 'Zwei Textaufträge, fünf Prüfungen', [fakes.log.texte.length, fakes.log.pruefungen.length])
  pruefe(fakes.log.texte.every((t) => t.wissenZeichen > 2000), `IG-Wissen war bei jedem Claude-Aufruf im Kontext (${fakes.wissenQuelle}, ${fakes.log.github.filter((p) => p.endsWith('.md')).length} Dokumente)`)

  abschnitt('4. Meta: alles pausiert angelegt, Budget = Monatsbudget / 31, live erst am Ende')
  const anlagen = fakes.log.meta.filter((m) => m.methode === 'POST' && m.pfad.startsWith('act_') && !/adimages|adcreatives/.test(m.pfad))
  pruefe(anlagen.length === 6 && anlagen.every((m) => m.werte.status === 'PAUSED'), 'Kampagne, Anzeigengruppe und vier Anzeigen wurden pausiert angelegt', anlagen.map((m) => [m.pfad, m.werte.status]))
  const adset = metaObjekt(l.kampagne.meta_adset_id)
  pruefe(Number(adset?.daily_budget) === tagesbudgetCent(500) && Number(l.kampagne.tagesbudget_cent) === 1612, 'Tagesbudget bei Meta ist 16,12 € (500 € / 31)', adset?.daily_budget)
  pruefe(adset?.targeting?.geo_locations?.custom_locations?.[0]?.radius === 25 && adset.targeting.geo_locations.custom_locations[0].latitude === 52.52, 'Umkreis 25 km um Berlin')
  pruefe(adset?.dsa_beneficiary && adset?.promoted_object?.pixel_id === 'pixel1', 'DSA-Angaben und Pixel sind gesetzt')
  const aktivierungen = fakes.log.meta.filter((m) => m.methode === 'POST' && m.werte.status === 'ACTIVE').map((m) => metaObjekt(m.pfad)?.art)
  pruefe(aktivierungen.join() === 'ad,ad,ad,ad,adset,campaign', 'Live-Reihenfolge: erst Anzeigen, dann Anzeigengruppe, zuletzt Kampagne', aktivierungen)
  const erstesActive = fakes.log.meta.findIndex((m) => m.werte.status === 'ACTIVE')
  pruefe(fakes.log.meta.slice(0, erstesActive).every((m) => m.werte.status !== 'ACTIVE'), 'Vor dem Live-Schritt war nichts aktiv')
  const liveFreigabe = l.approvals.filter((a) => a.art === 'kampagne_live' && !a.details?.autopilot)
  pruefe(liveFreigabe.length === 1 && liveFreigabe[0].user_id === RICK && liveFreigabe[0].details?.tagesbudget_cent === 1612, 'Live-Schaltung ist protokolliert und Rick zugerechnet')
  pruefe(l.approvals.every((a) => a.user_id === RICK), 'Alle Freigaben hängen an Ricks Start, niemand sonst hat geklickt', l.approvals.map((a) => [a.art, a.user_id]))

  abschnitt('5. Protokoll und Sperre')
  const schritte = l.protokoll.filter((p) => p.ereignis === 'autopilot').map((p) => p.details.schritt)
  for (const s of ['texte', 'pruefen', 'bilder', 'freigeben', 'meta_anlegen', 'live']) pruefe(schritte.includes(s), `Schritt "${s}" steht im Protokoll`)
  pruefe(l.protokoll.every((p) => p.ereignis === 'autopilot' && p.region_id === berlin.id), 'Kein Fehler im Protokoll', l.protokoll.filter((p) => p.details?.fehler))
  pruefe(l.lauf.laeuft_seit === null && l.lauf.letzter_bericht?.regionen?.[berlin.id]?.name === 'Berlin', 'Sperre ist frei, letzter Bericht gespeichert')

  abschnitt('6. Nächster Lauf tut nichts (nichts doppelt)')
  bericht = await autopilotLauf({ heute })
  pruefe((bericht.regionen[berlin.id]?.schritte || []).length === 0 && !bericht.fehler, 'Keine Schritte, kein Fehler', bericht.regionen[berlin.id])
  pruefe(fakes.log.texte.length === 2 && fakes.log.higgsfield.length === 12, 'Keine neuen Texte oder Bilder')

  abschnitt('7. Rick senkt das Monatsbudget auf 400 €, der Autopilot zieht Meta nach')
  const b4 = await rick.from('ads_regions').update({ monatsbudget_eur: 400 }).eq('id', berlin.id)
  pruefe(!b4.error, 'Budgetänderung gespeichert', b4.error?.message)
  bericht = await autopilotLauf({ heute })
  l = await lade()
  pruefe((bericht.regionen[berlin.id]?.schritte || []).join() === 'budget', 'Genau ein Schritt: budget', bericht.regionen[berlin.id])
  pruefe(Number(metaObjekt(l.kampagne.meta_adset_id).daily_budget) === 1290 && Number(l.kampagne.tagesbudget_cent) === 1290, 'Tagesbudget bei Meta jetzt 12,90 €', metaObjekt(l.kampagne.meta_adset_id).daily_budget)
  const budgetFreigabe = l.approvals.filter((a) => a.art === 'budget' && a.details?.tagesbudget_neu_cent === 1290)
  pruefe(budgetFreigabe.length === 1 && budgetFreigabe[0].user_id === RICK, 'Budgetübertragung protokolliert')

  abschnitt('8. Lead vom Erfolgscheck kommt an und geht als QualifiedLead an Meta')
  const lifestyle = frei.find((c) => c.motiv === 'lifestyle')
  const antwort = await leadEingang(new Request(`${B}/.netlify/functions/lead-eingang`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-lead-secret': 'lead-geheimnis' },
    body: JSON.stringify({ externe_id: 'erfolgscheck-1', email: 'Max@Beispiel.de', score: 85, utm_campaign: 'berlin', utm_content: 'lifestyle', utm_term: lifestyle.id, event_time: new Date().toISOString() }),
  }))
  const leadDaten = await antwort.json()
  pruefe(antwort.status === 200 && leadDaten.stufe === 'hoch' && leadDaten.meta_gemeldet === true, 'Lead angenommen, Stufe hoch, an Meta gemeldet', leadDaten)
  const lead = daten(await sb.from('ads_leads').select('*').eq('externe_id', 'erfolgscheck-1').single(), 'Lead')
  pruefe(lead.region_id === berlin.id && lead.creative_id === lifestyle.id && lead.motiv === 'lifestyle' && lead.meta_gemeldet_am, 'Lead ist Region, Motiv und Anzeige zugeordnet')
  pruefe(fakes.log.capi.length === 1 && fakes.log.capi[0].event_name === 'QualifiedLead' && fakes.log.capi[0].user_data.em[0] === createHashHex('max@beispiel.de'), 'Meta bekam QualifiedLead mit gehashter E-Mail')
  const falsch = await leadEingang(new Request(`${B}/x`, { method: 'POST', headers: { 'x-lead-secret': 'falsch' }, body: '{}' }))
  pruefe(falsch.status === 401, 'Falsches Geheimnis wird abgewiesen')

  abschnitt('9. Montags lernt die App: teures Motiv wird pausiert und ersetzt')
  const montag = new Date(heute)
  montag.setUTCDate(montag.getUTCDate() + ((8 - montag.getUTCDay()) % 7 || 7))
  const vor20Tagen = new Date(heute.getTime() - 20 * 86400000).toISOString()
  for (const c of frei) daten(await sb.from('ads_creatives').update({ freigegeben_am: vor20Tagen }).eq('id', c.id), 'Alter setzen')
  const tag = heute.toISOString().slice(0, 10)
  daten(await sb.from('ads_metrics_daily').insert(frei.map((c) => ({
    datum: tag, meta_ad_id: c.meta_ad_id, region_id: berlin.id, creative_id: c.id,
    ausgaben_eur: c.motiv === 'lifestyle' ? 120 : 10, impressionen: 1000, klicks: 50, leads_meta: 3,
  }))), 'Kennzahlen')
  daten(await sb.from('ads_leads').insert(Array.from({ length: 10 }, (_, i) => ({
    externe_id: `ec-${i}`, region_id: berlin.id, motiv: 'gruendergeschichte', score: 80, stufe: 'hoch',
  }))), 'Leads')
  bericht = await autopilotLauf({ heute: montag })
  l = await lade()
  const optimierung = bericht.regionen[berlin.id]?.optimierung || []
  pruefe(optimierung.length === 1 && optimierung[0].motiv === 'lifestyle', 'Nur lifestyle erkannt: 120 € ohne guten Lead. Motive unter 50 € Ausgaben werden nicht beurteilt', optimierung)
  pruefe(metaObjekt(lifestyle.meta_ad_id)?.status === 'PAUSED', 'Alte lifestyle-Anzeige bei Meta pausiert')
  const lifestyleNeu = l.creatives.filter((c) => c.motiv === 'lifestyle' && c.status === 'freigegeben')
  pruefe(l.creatives.find((c) => c.id === lifestyle.id)?.status === 'archiviert' && lifestyleNeu.length === 1 && lifestyleNeu[0].meta_ad_id && lifestyleNeu[0].meta_aktiv, 'Neue lifestyle-Variante erzeugt, geprüft, bebildert, bei Meta angelegt und aktiv', bericht.regionen[berlin.id]?.schritte)
  pruefe(l.protokoll.some((p) => p.details?.schritt === 'optimierung' && p.details?.motiv === 'lifestyle'), 'Lernschritt steht mit Begründung im Protokoll')
  pruefe(l.lauf.letzte_optimierung && !bericht.fehler, 'Lernen ist für diese Woche vermerkt', bericht.fehler)

  abschnitt('10. Ohne Meta-Schlüssel bereitet die App vor und wartet (kein Fehlerstrom)')
  const metaToken = process.env.META_ACCESS_TOKEN
  delete process.env.META_ACCESS_TOKEN
  daten(await rick.from('ads_regions').update({ autopilot: true }).eq('slug', 'stuttgart'), 'Stuttgart starten')
  const stuttgart = daten(await sb.from('ads_regions').select('*').eq('slug', 'stuttgart').single(), 'Stuttgart')
  bericht = await autopilotLauf({ heute })
  const s1 = bericht.regionen[stuttgart.id]
  pruefe(s1 && !bericht.fehler && s1.schritte.every((x) => !/Fehler|meta|live/.test(x)) && s1.schritte.includes('freigeben'), 'Stuttgart: Texte, Prüfung, Bilder, Freigabe erledigt, nichts bei Meta', s1)
  pruefe((s1?.hinweise || []).includes(HINWEIS_META_FEHLT), 'Bericht sagt, dass die Meta-Schlüssel fehlen')
  bericht = await autopilotLauf({ heute })
  const hinweise = daten(await sb.from('ads_protokoll').select('*').eq('region_id', stuttgart.id), 'Protokoll').filter((p) => p.details?.schritt === 'hinweis' && p.details?.text === HINWEIS_META_FEHLT)
  pruefe(hinweise.length === 1, 'Der Hinweis steht nur einmal im Protokoll, nicht je Lauf', hinweise.length)
  process.env.META_ACCESS_TOKEN = metaToken
  bericht = await autopilotLauf({ heute })
  const stuttgartK = daten(await sb.from('ads_campaigns').select('*').eq('region_id', stuttgart.id).maybeSingle(), 'Kampagne Stuttgart')
  pruefe(stuttgartK?.status === 'live', 'Sobald die Schlüssel da sind, geht Stuttgart im nächsten Lauf live', bericht.regionen[stuttgart.id])

  abschnitt('11. Rick stoppt die Partnersuche in Berlin')
  const stopp = await rick.from('ads_regions').update({ autopilot: false }).eq('id', berlin.id)
  pruefe(!stopp.error, 'Stopp gespeichert', stopp.error?.message)
  await schalten({ user: { id: RICK }, body: { region_id: berlin.id, aktion: 'pause', kommentar: 'Partnersuche gestoppt' } })
  l = await lade()
  pruefe(l.kampagne.status === 'pausiert' && metaObjekt(l.kampagne.meta_campaign_id).status === 'PAUSED', 'Kampagne bei Meta pausiert')
  pruefe(l.approvals.some((a) => a.art === 'kampagne_pause' && a.details?.autopilot === false), 'Stopp steht im Freigabeprotokoll')
  bericht = await autopilotLauf({ heute })
  pruefe(!bericht.regionen[berlin.id], 'Berlin wird vom Autopiloten nicht mehr angefasst')
} catch (e) {
  console.error(`\nABBRUCH: ${e.stack || e.message}`)
  ergebnisse.push({ ok: false, text: `Abbruch: ${e.message}` })
} finally {
  await fakes.schliessen()
}

function createHashHex(s) {
  return createHash('sha256').update(s).digest('hex')
}

const fehl = ergebnisse.filter((e) => !e.ok)
console.log(`\n${ergebnisse.length - fehl.length} von ${ergebnisse.length} Prüfungen bestanden.`)
console.log(`Aufrufe an Attrappen: Claude ${fakes.log.texte.length + fakes.log.pruefungen.length}, Higgsfield ${fakes.log.higgsfield.length}, Meta ${fakes.log.meta.length}, Conversions API ${fakes.log.capi.length}.`)
if (fehl.length) {
  console.log('Nicht bestanden:\n' + fehl.map((f) => `  - ${f.text}`).join('\n'))
  process.exit(1)
}
console.log('Ende-zu-Ende-Lauf bestanden: ein Klick, der Rest lief von allein.')
