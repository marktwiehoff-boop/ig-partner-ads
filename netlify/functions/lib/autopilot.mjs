// Autopilot: Rick startet die Partnersuche für eine Region (das ist die
// menschliche Freigabe). Ab dann läuft alle 15 Minuten dieser Planer:
//
//   Texte -> Qualitätsprüfung -> Bilder -> Freigabe -> Kampagne bei Meta
//   -> Tagesbudget an Meta -> Live -> im neuen Monat wieder live
//
// Der Planer (planeRegion) ist eine reine Funktion ohne Netzwerk und wird
// getestet. Die Ausführung (regionBearbeiten) nutzt die bestehenden Bausteine
// der App und schreibt jeden Schritt ins Protokoll.
//
// Harte Grenzen bleiben: Obergrenzen sitzen in der Datenbank, mehr Budget gibt
// es nur, wenn ein Mensch das Monatsbudget ändert. Der Autopilot kann
// Ausgaben nur im Rahmen des freigegebenen Monatsbudgets verursachen.

import { serviceClient, pruefe } from './supabase.mjs'
import { ausgabenMonat } from './lage.mjs'
import { ladeMarkenwissen } from './igwissen.mjs'
import { pruefeAnzeige, befundeText } from './pruefer.mjs'
import { metaKonfig, setzeStatus } from './meta.mjs'
import { schwacheMotive, wochenbeginn } from './optimierung.mjs'
import { texteErzeugen } from '../texte-erzeugen-background.mjs'
import { medienErzeugen } from '../medien-erzeugen-background.mjs'
import { kampagneAnlegen } from '../kampagne-anlegen-background.mjs'
import { schalten } from '../kampagne-schalten.mjs'
import { budgetUebertragen } from '../budget-uebertragen.mjs'
import { MOTIV_SCHLUESSEL, MOTIVE } from '../../../shared/motive.js'
import { pruefeCreative } from '../../../shared/markenregeln.js'
import { tagesbudgetCent, schutzpauseGrund, gesamtSchutzGrund } from '../../../shared/budget.js'

export const MAX_ABLEHNUNGEN_JE_MOTIV = 2 // in 7 Tagen, danach wartet das Motiv auf einen Menschen
export const ZEITBUDGET_MS = 10 * 60 * 1000 // Netlify-Hintergrund darf 15 Minuten
const BILDER_JE_RUNDE = 2
export const HINWEIS_META_FEHLT = 'Meta-Schlüssel fehlen in Netlify (META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, META_PAGE_ID, META_PIXEL_ID). Texte, Prüfung, Bilder und Freigabe laufen weiter, die Kampagne wartet.'

const hatBild = (c) => (c.medien || []).some((m) => m.typ === 'bild' && m.url)
const offen = (c) => !['archiviert', 'abgelehnt'].includes(c.status)

export function abgelehnteVersuche(creatives, motiv, heute = new Date()) {
  const seit = heute.getTime() - 7 * 86400000
  return creatives.filter((c) => c.motiv === motiv && c.status === 'abgelehnt' && c.markencheck?.pruefung
    && new Date(c.updated_at || c.created_at).getTime() >= seit).length
}

/**
 * Reiner Planer. Rückgabe { schritte: [{ art, ... }], hinweise: [] }.
 * Reihenfolge der Schritte = Reihenfolge der Ausführung.
 */
export function planeRegion({ region, kampagne, creatives, ausgabenRegion = 0, ausgabenGesamt = 0, einst, heute = new Date(), metaBereit = true }) {
  const schritte = []
  const hinweise = []
  if (!region?.autopilot || !region.aktiv) return { schritte, hinweise }

  const aktive = creatives.filter(offen)

  // 1. Texte für Motive ohne laufende Anzeige
  const fehlend = []
  for (const m of MOTIV_SCHLUESSEL) {
    if (aktive.some((c) => c.motiv === m)) continue
    if (abgelehnteVersuche(creatives, m, heute) >= MAX_ABLEHNUNGEN_JE_MOTIV) {
      hinweise.push(`Motiv ${MOTIVE[m].titel}: zweimal von der Prüfung abgelehnt, braucht einen Menschen.`)
      continue
    }
    fehlend.push(m)
  }
  if (fehlend.length) {
    const letzteBefunde = fehlend.map((m) => {
      const c = creatives.filter((x) => x.motiv === m && x.status === 'abgelehnt' && x.markencheck?.pruefung)
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0]
      return c ? `${MOTIVE[m].titel}: ${befundeText(c.markencheck.pruefung)}` : null
    }).filter(Boolean)
    schritte.push({
      art: 'texte', motive: fehlend,
      hinweis: letzteBefunde.length ? `Vorherige Varianten wurden abgelehnt. Vermeide: ${letzteBefunde.join(' || ')}` : '',
    })
  }

  // 2. Qualitätsprüfung für Entwürfe ohne Prüfung
  for (const c of aktive.filter((x) => x.status === 'entwurf' && !x.markencheck?.pruefung)) {
    schritte.push({ art: 'pruefen', creative_id: c.id })
  }

  // 3. Bilder für geprüfte Entwürfe ohne Bild
  for (const c of aktive.filter((x) => x.status === 'entwurf' && x.markencheck?.pruefung?.bestanden && !hatBild(x))) {
    schritte.push({ art: 'bilder', creative_id: c.id })
  }

  // 4. Freigabe geprüfter Entwürfe mit Bild und sauberen Markenregeln
  for (const c of aktive.filter((x) => x.status === 'entwurf' && x.markencheck?.pruefung?.bestanden && hatBild(x))) {
    if (pruefeCreative(c).verstoesse.length) continue
    if (region.freigabe_modus === 'automatisch') schritte.push({ art: 'freigeben', creative_id: c.id })
    else hinweise.push(`${MOTIVE[c.motiv]?.titel || c.motiv}: wartet auf Freigabe durch einen Menschen (Modus manuell).`)
  }

  // 5. Freigegebene Anzeigen zu Meta. Ohne Meta-Schlüssel wird alles bis zur
  // Freigabe vorbereitet, die Kampagne wartet, bis die Schlüssel da sind.
  const freigegeben = aktive.filter((x) => x.status === 'freigegeben' && hatBild(x))
  if (!metaBereit) {
    hinweise.push(HINWEIS_META_FEHLT)
    return { schritte, hinweise }
  }
  if (freigegeben.some((x) => !x.meta_ad_id)) schritte.push({ art: 'meta_anlegen' })

  // 6. Tagesbudget an Meta angleichen (immer Monatsbudget / 31, nie darüber)
  const tb = tagesbudgetCent(region.monatsbudget_eur)
  if (kampagne?.meta_adset_id && Number(kampagne.tagesbudget_cent) !== tb) schritte.push({ art: 'budget', tagesbudget_cent: tb })

  // 7. Live, wenn nichts dagegen spricht
  const beiMeta = freigegeben.filter((x) => x.meta_ad_id)
  if (kampagne?.meta_campaign_id && beiMeta.length) {
    const monat = heute.toISOString().slice(0, 7)
    const schutz = schutzpauseGrund({ region, ausgabenMonatEur: ausgabenRegion, tagesbudgetCent: kampagne.tagesbudget_cent || tb })
      || gesamtSchutzGrund({ ausgabenGesamtEur: ausgabenGesamt, gesamtObergrenzeEur: einst?.gesamt_obergrenze_eur ?? Infinity })
    const schutzpauseDiesenMonat = String(kampagne.letzter_fehler || '').startsWith('Schutzpause')
      && String(kampagne.updated_at || '').slice(0, 7) === monat
    if (schutz) hinweise.push(`Bleibt pausiert: ${schutz}`)
    else if (schutzpauseDiesenMonat) hinweise.push('Schutzpause bis zum Monatsende, dann geht es automatisch weiter.')
    else if (kampagne.status === 'pausiert' || beiMeta.some((x) => !x.meta_aktiv)) schritte.push({ art: 'live' })
  }

  return { schritte, hinweise }
}

async function ladeLage(sb, regionId) {
  const region = pruefe(await sb.from('ads_regions').select('*').eq('id', regionId).single(), 'Region laden')
  const kampagne = pruefe(await sb.from('ads_campaigns').select('*').eq('region_id', regionId).maybeSingle(), 'Kampagne laden')
  const creatives = pruefe(await sb.from('ads_creatives').select('*').eq('region_id', regionId), 'Anzeigen laden')
  const einst = pruefe(await sb.from('ads_einstellungen').select('*').eq('id', true).single(), 'Einstellungen laden')
  const ausgaben = await ausgabenMonat()
  return { region, kampagne, creatives, einst, ausgabenRegion: ausgaben.jeRegion[regionId] || 0, ausgabenGesamt: ausgaben.gesamt }
}

export async function protokoll(sb, regionId, details) {
  await sb.from('ads_protokoll').insert({ ereignis: 'autopilot', region_id: regionId, details })
}

/** Derselbe Hinweis steht höchstens einmal am Tag im Protokoll, nicht alle 15 Minuten. */
export async function hinweisProtokoll(sb, regionId, text) {
  const seit = new Date(Date.now() - 24 * 3600000).toISOString()
  const { data } = await sb.from('ads_protokoll').select('id').eq('region_id', regionId).eq('ereignis', 'autopilot')
    .eq('details->>schritt', 'hinweis').eq('details->>text', text).gte('created_at', seit).limit(1)
  if (data?.length) return false
  await protokoll(sb, regionId, { schritt: 'hinweis', text })
  return true
}

function metaBereit() {
  try {
    metaKonfig()
    return true
  } catch {
    return false
  }
}

/** Standard-Bausteine, in Tests austauschbar. */
export function standardBausteine() {
  return {
    ladeLage,
    wissen: () => ladeMarkenwissen(),
    texte: (job, user) => texteErzeugen(job, user),
    pruefen: (args) => pruefeAnzeige(args),
    bilder: (job, user) => medienErzeugen(job, user),
    metaAnlegen: (job, user) => kampagneAnlegen(job, user),
    budget: (args) => budgetUebertragen(args),
    live: (args) => schalten(args),
    metaBereit,
    jetzt: () => Date.now(),
  }
}

/** Lage einer Region samt Meta-Bereitschaft, Grundlage für den Planer. */
async function lageLaden(sb, regionId, b) {
  const lage = await b.ladeLage(sb, regionId)
  return { ...lage, metaBereit: b.metaBereit ? b.metaBereit() : true }
}

/**
 * Führt für eine Region so viele Schritte aus, wie das Zeitbudget erlaubt.
 * Nach jedem Schritt wird neu geplant, damit nichts doppelt passiert.
 */
export async function regionBearbeiten(regionId, b = standardBausteine(), start = b.jetzt()) {
  const sb = serviceClient()
  const erledigt = []
  const zeitUebrig = () => b.jetzt() - start < ZEITBUDGET_MS

  for (let runde = 0; runde < 12 && zeitUebrig(); runde++) {
    const lage = await lageLaden(sb, regionId, b)
    const { region } = lage
    const user = { id: region.autopilot_von }
    const plan = planeRegion(lage)
    if (runde === 0) for (const h of plan.hinweise) await hinweisProtokoll(sb, regionId, h)
    if (plan.schritte.length === 0) break

    let bilderInRunde = 0
    let etwasGetan = false
    for (const s of plan.schritte) {
      if (!zeitUebrig()) break
      if (s.art === 'bilder' && bilderInRunde >= BILDER_JE_RUNDE) continue
      try {
        await schrittAusfuehren(sb, b, lage, user, s)
      } catch (e) {
        await protokoll(sb, regionId, { schritt: s.art, fehler: e.message, creative_id: s.creative_id || null })
        erledigt.push({ ...s, fehler: e.message })
        // Beim selben Schritt nicht in der Schleife hängen bleiben
        return erledigt
      }
      erledigt.push(s)
      etwasGetan = true
      if (s.art === 'bilder') bilderInRunde++
      if (s.art === 'texte') break // danach neu planen (Prüfung der neuen Entwürfe)
    }
    if (!etwasGetan) break
  }
  return erledigt
}

async function schrittAusfuehren(sb, b, lage, user, s) {
  const { region } = lage
  const regionId = region.id
  if (s.art === 'texte') {
    const r = await b.texte({ eingabe: { region_id: regionId, motive: s.motive, anzahl_je_motiv: 1, hinweis: s.hinweis } }, user)
    await protokoll(sb, regionId, { schritt: 'texte', motive: s.motive, anzahl: r.creative_ids.length })
    return
  }
  if (s.art === 'pruefen') {
    const c = lage.creatives.find((x) => x.id === s.creative_id)
    const wissen = await b.wissen()
    const pruefung = await b.pruefen({ wissen, region, creative: c })
    const markencheck = { ...c.markencheck, pruefung }
    if (pruefung.bestanden) {
      pruefe(await sb.from('ads_creatives').update({ markencheck }).eq('id', c.id), 'Prüfung speichern')
    } else {
      pruefe(await sb.from('ads_creatives').update({ markencheck, status: 'abgelehnt' }).eq('id', c.id), 'Ablehnung speichern')
      await sb.from('ads_approvals').insert({
        art: 'creative', objekt_id: c.id, entscheidung: 'abgelehnt',
        kommentar: `Automatisch abgelehnt: ${befundeText(pruefung)}`.slice(0, 500),
        details: { automatisch: true, pruefung }, user_id: region.autopilot_von,
      })
    }
    await protokoll(sb, regionId, { schritt: 'pruefen', creative_id: c.id, motiv: c.motiv, bestanden: pruefung.bestanden, befunde: befundeText(pruefung) })
    return
  }
  if (s.art === 'bilder') {
    const r = await b.bilder({ eingabe: { creative_id: s.creative_id, referenz_id: 'auto' } }, user)
    await protokoll(sb, regionId, { schritt: 'bilder', creative_id: s.creative_id, anzahl: r.anzahl, mit_vorlage: Boolean(r.referenz) && !r.ohne_referenz })
    return
  }
  if (s.art === 'freigeben') {
    const c = lage.creatives.find((x) => x.id === s.creative_id)
    pruefe(await sb.rpc('ads_creative_auto_freigeben', { p_creative_id: c.id, p_pruefung: c.markencheck.pruefung }), 'Automatische Freigabe')
    await protokoll(sb, regionId, { schritt: 'freigeben', creative_id: c.id, motiv: c.motiv })
    return
  }
  if (s.art === 'meta_anlegen') {
    const r = await b.metaAnlegen({ eingabe: { region_id: regionId } }, user)
    await protokoll(sb, regionId, { schritt: 'meta_anlegen', neu: r.neu, status: r.status })
    return
  }
  if (s.art === 'budget') {
    const r = await b.budget({ user, body: { region_id: regionId, bestaetigt: true, kommentar: 'Autopilot: Monatsbudget der Region' } })
    await protokoll(sb, regionId, { schritt: 'budget', tagesbudget_cent: r.tagesbudget_cent, vorher_cent: r.vorher_cent })
    return
  }
  if (s.art === 'live') {
    const r = await b.live({ user, body: { region_id: regionId, aktion: 'live', bestaetigt: true, kommentar: 'Autopilot' } })
    await protokoll(sb, regionId, { schritt: 'live', status: r.status, gesperrt: r.gesperrt || null, anzeigen: r.anzeigen })
  }
}

/** Wöchentlich: schwache Motive pausieren, Protokoll mit Begründung. */
export async function wocheOptimieren(regionId, { cfg, setzeStatusFn = setzeStatus, heute = new Date() } = {}) {
  const sb = serviceClient()
  const bis = heute.toISOString().slice(0, 10)
  const von = new Date(heute.getTime() - 28 * 86400000).toISOString().slice(0, 10)
  const zeilen = pruefe(await sb.rpc('ads_dashboard', { p_von: von, p_bis: bis }), 'Kennzahlen laden')
    .filter((z) => z.region_id === regionId)
  const creatives = pruefe(await sb.from('ads_creatives').select('*').eq('region_id', regionId).eq('status', 'freigegeben'), 'Anzeigen laden')
  const liveSeit = {}
  for (const c of creatives) if (c.freigegeben_am && (!liveSeit[c.motiv] || c.freigegeben_am < liveSeit[c.motiv])) liveSeit[c.motiv] = c.freigegeben_am

  const schwach = schwacheMotive({ zeilen, liveSeit, heute })
  for (const s of schwach) {
    for (const c of creatives.filter((x) => x.motiv === s.motiv)) {
      for (const id of [c.meta_ad_id, c.meta_video_ad_id].filter(Boolean)) await setzeStatusFn(cfg || metaKonfig(), id, 'PAUSED')
      pruefe(await sb.from('ads_creatives').update({ status: 'archiviert', meta_aktiv: false }).eq('id', c.id), 'Anzeige archivieren')
    }
    await protokoll(sb, regionId, { schritt: 'optimierung', motiv: s.motiv, grund: s.grund, folge: 'Motiv pausiert, neue Variante wird erzeugt' })
  }
  return schwach
}

/** Ein kompletter Lauf über alle Regionen mit Autopilot. */
export async function autopilotLauf({ bausteine = standardBausteine(), heute = new Date() } = {}) {
  const sb = serviceClient()
  const sperre = pruefe(await sb.rpc('ads_autopilot_sperre_holen'), 'Sperre')
  if (!sperre) return { uebersprungen: true, grund: 'Ein anderer Lauf ist noch aktiv.' }

  const bericht = { regionen: {}, begonnen: new Date().toISOString() }
  const start = bausteine.jetzt()
  try {
    const regionen = pruefe(await sb.from('ads_regions').select('*').eq('autopilot', true).eq('aktiv', true), 'Regionen laden')

    const lauf = pruefe(await sb.from('ads_autopilot_lauf').select('*').eq('id', true).single(), 'Lauf laden')
    const woche = wochenbeginn(heute)
    const optimieren = heute.getUTCDay() === 1 && lauf.letzte_optimierung !== woche
    if (optimieren) {
      for (const r of regionen) {
        try {
          bericht.regionen[r.id] = { optimierung: await wocheOptimieren(r.id, { heute }) }
        } catch (e) {
          await protokoll(sb, r.id, { schritt: 'optimierung', fehler: e.message })
        }
      }
      pruefe(await sb.from('ads_autopilot_lauf').update({ letzte_optimierung: woche }).eq('id', true), 'Optimierung merken')
    }

    for (const r of regionen) {
      if (bausteine.jetzt() - start >= ZEITBUDGET_MS) break
      const schritte = await regionBearbeiten(r.id, bausteine, start)
      const danach = planeRegion(await lageLaden(sb, r.id, bausteine))
      bericht.regionen[r.id] = {
        ...bericht.regionen[r.id], name: r.name,
        schritte: schritte.map((s) => s.fehler ? `${s.art}: Fehler` : s.art),
        hinweise: danach.hinweise, offen: danach.schritte.map((s) => s.art),
      }
    }
  } catch (e) {
    bericht.fehler = e.message
  } finally {
    bericht.beendet = new Date().toISOString()
    await sb.rpc('ads_autopilot_sperre_freigeben', { p_bericht: bericht })
  }
  return bericht
}
