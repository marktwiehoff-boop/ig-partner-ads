// Attrappen für alles, was im Ende-zu-Ende-Lauf nicht echt sein darf, weil es
// Geld kostet oder Schlüssel braucht: Claude, Higgsfield, Meta und GitHub
// (IG-Wissen). Dazu die Supabase-Hülle: /rest/v1 geht an das echte PostgREST,
// /storage/v1 ist ein kleiner Speicher im Arbeitsspeicher.
//
// Alles, was die Attrappen sehen, wird mitgeschrieben, damit der Lauf
// hinterher beweisen kann, was wirklich passiert ist.

import { createServer } from 'node:http'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
)

const WISSEN_NOTFALL = {
  'content/01_Marke_Branding/immergruen-markenstimme.md':
    '# immergrün Markenstimme\n\nWir sagen du. Kurze Sätze. Warm, direkt, lebensfroh. Keine Versprechen über Umsatz oder Gewinn.\n',
  'content/01_Marke_Branding/01-marke-kernidee-positionierung.md':
    '# Kernidee\n\nimmergrün macht frische Bowls, Salate, Säfte und Smoothies, live vor dem Gast zubereitet. Stores liegen in Shoppingcentern, Innenstädten und an Bahnhöfen.\n',
  'content/03_Partner_Expansion/franchise-und-expansion-grundsaetze.md':
    '# Franchise-Grundsätze\n\nPartner bekommen ein erprobtes Konzept, Schulung und Begleitung. Der Einstieg beginnt mit dem Erfolgscheck.\n',
}

/** Anzeigentexte, die die Markenregeln einhalten. zahlen_sicherheit erfindet beim ersten Mal eine Zahl. */
export function variante(motiv, hinweis) {
  const quellen = ['content/01_Marke_Branding/immergruen-markenstimme.md', 'content/03_Partner_Expansion/franchise-und-expansion-grundsaetze.md']
  const texte = {
    gruendergeschichte: {
      hook: 'Du willst deinen eigenen Laden? So fing immergrün an.',
      haupttext: 'immergrün ist aus einer einfachen Idee gewachsen: frische Bowls, Säfte und Smoothies, live vor dem Gast zubereitet. Heute begleiten wir Menschen wie dich in den eigenen Store. Mach den Erfolgscheck und finde heraus, ob das zu dir passt.',
      ueberschrift: 'Dein Start mit immergrün', cta_typ: 'LEARN_MORE',
      bild_idee: 'Eine Gründerin steht lächelnd hinter der Theke ihres immergrün Stores, frische grüne Zutaten vor sich, helles natürliches Licht.',
    },
    zahlen_sicherheit: /Vermeide/.test(hinweis)
      ? {
        hook: 'Du willst ein System, das trägt? immergrün gibt dir Struktur.',
        haupttext: 'Du bekommst ein erprobtes Konzept, Schulung und Begleitung vom ersten Tag an. Entscheidungen triffst du mit Zahlen, nicht mit Bauchgefühl. Mach den Erfolgscheck und sieh, ob der Weg zu dir passt.',
        ueberschrift: 'Sicher starten mit System', cta_typ: 'SIGN_UP',
        bild_idee: 'Ein Partner und eine Beraterin schauen gemeinsam auf ein Tablet im hellen Store, im Hintergrund die Theke mit grünem Obst.',
      }
      : {
        hook: 'Über 200 Stores vertrauen schon auf immergrün. Du auch?',
        haupttext: 'Du bekommst ein erprobtes Konzept und Begleitung vom ersten Tag an. Mach den Erfolgscheck und sieh, ob der Weg zu dir passt.',
        ueberschrift: 'Sicher starten mit System', cta_typ: 'SIGN_UP',
        bild_idee: 'Ein Partner und eine Beraterin schauen gemeinsam auf ein Tablet im hellen Store.',
      },
    lifestyle: {
      hook: 'Dein Arbeitstag riecht nach frischer Minze und Limette.',
      haupttext: 'Im immergrün Store arbeitest du mit frischen Zutaten, echten Gästen und einem Team, das anpackt. Kein Schreibtisch, sondern Leben. Mach den Erfolgscheck und finde heraus, ob das dein Ding ist.',
      ueberschrift: 'Frisch. Echt. Deins.', cta_typ: 'LEARN_MORE',
      bild_idee: 'Ein junges Team in grünen Schürzen bereitet Bowls vor, Gäste warten entspannt, Tageslicht fällt in den Store.',
    },
    echter_partner: {
      hook: 'Du bist nicht allein: Partner berichten, wie der Start bei immergrün lief.',
      haupttext: 'Unsere Franchise-Partner erzählen offen von Anfang, Alltag und Team. Du siehst, was auf dich zukommt. Mach den Erfolgscheck und sprich danach mit uns.',
      ueberschrift: 'Partner erzählen', cta_typ: 'CONTACT_US',
      bild_idee: 'Ein Franchise-Partner steht vor seinem Store im Shoppingcenter und lacht in die Kamera, Schürze und Cap in Grün.',
    },
  }
  return { motiv, ...texte[motiv], quellen }
}

function leseBody(req) {
  return new Promise((resolve) => {
    const teile = []
    req.on('data', (d) => teile.push(d))
    req.on('end', () => resolve(Buffer.concat(teile)))
  })
}

function sende(res, status, body, typ = 'application/json') {
  const daten = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)
  res.writeHead(status, { 'content-type': typ })
  res.end(daten)
}

export async function starteFakes({ port, pgrstUrl, wissenOrdner }) {
  const basis = `http://127.0.0.1:${port}`
  const log = { texte: [], pruefungen: [], higgsfield: [], meta: [], capi: [], storage: new Map(), github: [] }
  const meta = { objekte: new Map(), naechste: 120000000000 }
  const neueId = () => String(++meta.naechste)
  const wissen = wissenOrdner && existsSync(wissenOrdner) ? wissenOrdner : null

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, basis)
    const buf = await leseBody(req)
    try {
      // ---- Supabase REST: echtes PostgREST dahinter
      if (url.pathname.startsWith('/rest/v1/')) {
        const ziel = `${pgrstUrl}${url.pathname.slice('/rest/v1'.length)}${url.search}`
        const kopf = {}
        for (const k of ['authorization', 'content-type', 'accept', 'prefer', 'range', 'range-unit', 'accept-profile', 'content-profile']) {
          if (req.headers[k]) kopf[k] = req.headers[k]
        }
        const r = await fetch(ziel, { method: req.method, headers: kopf, body: buf.length ? buf : undefined })
        const antwortKopf = {}
        for (const k of ['content-type', 'content-range', 'preference-applied', 'location']) {
          if (r.headers.get(k)) antwortKopf[k] = r.headers.get(k)
        }
        res.writeHead(r.status, antwortKopf)
        res.end(Buffer.from(await r.arrayBuffer()))
        return
      }
      // ---- Supabase Storage (nur was die App braucht)
      if (url.pathname.startsWith('/storage/v1/object/public/')) {
        const pfad = decodeURIComponent(url.pathname.slice('/storage/v1/object/public/'.length))
        const d = log.storage.get(pfad)
        if (!d) return sende(res, 404, { error: 'nicht gefunden', pfad })
        return sende(res, 200, d.bytes, d.typ)
      }
      if (url.pathname.startsWith('/storage/v1/object/') && ['POST', 'PUT'].includes(req.method)) {
        const pfad = decodeURIComponent(url.pathname.slice('/storage/v1/object/'.length))
        log.storage.set(pfad, { bytes: buf, typ: req.headers['content-type'] || 'application/octet-stream' })
        return sende(res, 200, { Id: String(log.storage.size), Key: pfad })
      }
      // ---- Claude
      if (url.pathname === '/anthropic/v1/messages') {
        const body = JSON.parse(buf.toString())
        const system = (body.system || []).map((s) => s.text).join('\n')
        const auftrag = String(body.messages?.[0]?.content || '')
        if (!/<immergruen_wissen>/.test(system)) return sende(res, 400, { error: { message: 'Kein IG-Wissen im Kontext' } })
        let daten
        if (/Du prüfst Meta-Anzeigen/.test(system)) {
          log.pruefungen.push(auftrag)
          daten = /200 Stores/.test(auftrag)
            ? { bestanden: false, zusammenfassung: 'Erfundene Zahl.', befunde: [{ punkt: 'fakten', schwere: 'blockiert', begruendung: 'Die Zahl 200 Stores steht nicht im Wissen.' }] }
            : { bestanden: true, zusammenfassung: 'Passt zum IG-Wissen.', befunde: [{ punkt: 'sonstiges', schwere: 'hinweis', begruendung: 'Ortsbezug ist natürlich.' }] }
        } else {
          const motive = (auftrag.match(/für diese Motive: ([^.\n]+)\./) || [, ''])[1].split(',').map((s) => s.trim()).filter(Boolean)
          const hinweis = (auftrag.match(/Wunsch von Rick aus der Expansion: (.*)/) || [, ''])[1]
          log.texte.push({ motive, hinweis, wissenZeichen: system.length })
          daten = { varianten: motive.map((m) => variante(m, hinweis)) }
        }
        return sende(res, 200, {
          id: `msg_${log.texte.length + log.pruefungen.length}`, type: 'message', role: 'assistant', model: body.model,
          content: [{ type: 'text', text: JSON.stringify(daten) }], stop_reason: 'end_turn', stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 10 },
        })
      }
      // ---- Higgsfield
      if (url.pathname === '/hf/higgsfield-ai/soul/standard' && req.method === 'POST') {
        const body = JSON.parse(buf.toString())
        if (!/^Key .+:.+/.test(req.headers.authorization || '')) return sende(res, 401, { detail: 'Kein Schlüssel' })
        const id = `hf-${log.higgsfield.length + 1}`
        log.higgsfield.push({ id, aspect_ratio: body.aspect_ratio, referenz: body.image_reference?.image_url || null })
        return sende(res, 200, { request_id: id, status: 'completed', images: [{ url: `${basis}/hf/bild/${id}.jpg` }] })
      }
      if (/^\/hf\/requests\/[^/]+\/status$/.test(url.pathname)) {
        const id = url.pathname.split('/')[3]
        return sende(res, 200, { status: 'completed', images: [{ url: `${basis}/hf/bild/${id}.jpg` }] })
      }
      if (url.pathname.startsWith('/hf/bild/') || url.pathname === '/vorlage.jpg') return sende(res, 200, JPEG, 'image/jpeg')
      // ---- GitHub (IG-Wissen)
      if (url.pathname.startsWith('/github/repos/')) {
        const pfad = decodeURIComponent(url.pathname.replace(/^\/github\/repos\/[^/]+\/[^/]+\/contents\//, ''))
        log.github.push(pfad)
        if (!/^Bearer .+/.test(req.headers.authorization || '')) return sende(res, 401, { message: 'Bad credentials' })
        const roh = (req.headers.accept || '').includes('raw')
        if (roh) {
          const datei = wissen ? join(wissen, pfad) : null
          const text = datei && existsSync(datei) ? readFileSync(datei, 'utf8') : WISSEN_NOTFALL[pfad]
          if (text == null) return sende(res, 404, { message: 'Not Found' })
          return sende(res, 200, text, 'text/plain; charset=utf-8')
        }
        const ordner = wissen ? join(wissen, pfad) : null
        const namen = ordner && existsSync(ordner)
          ? readdirSync(ordner).filter((n) => n.endsWith('.md'))
          : Object.keys(WISSEN_NOTFALL).filter((k) => k.startsWith(`${pfad}/`)).map((k) => k.slice(pfad.length + 1))
        return sende(res, 200, namen.map((name) => ({ type: 'file', name, path: `${pfad}/${name}` })))
      }
      // ---- Meta Graph API
      if (url.pathname.startsWith('/meta/')) {
        const teile = url.pathname.split('/').filter(Boolean) // meta, v26.0, ...rest
        const rest = teile.slice(2).join('/')
        const felder = req.method === 'GET'
          ? Object.fromEntries(url.searchParams)
          : Object.fromEntries(new URLSearchParams(buf.toString()))
        if (!felder.access_token) return sende(res, 401, { error: { message: 'Kein access_token', code: 190 } })
        const { access_token: _t, appsecret_proof: _p, ...werte } = felder
        log.meta.push({ methode: req.method, pfad: rest, werte })
        const anlegen = (art) => {
          const id = neueId()
          const o = { id, art, ...werte }
          for (const k of ['targeting', 'promoted_object', 'object_story_spec', 'creative', 'special_ad_categories']) {
            if (typeof o[k] === 'string') { try { o[k] = JSON.parse(o[k]) } catch { /* bleibt Text */ } }
          }
          meta.objekte.set(id, o)
          return o
        }
        if (req.method === 'POST' && /^act_\w+\/campaigns$/.test(rest)) return sende(res, 200, { id: anlegen('campaign').id })
        if (req.method === 'POST' && /^act_\w+\/adsets$/.test(rest)) return sende(res, 200, { id: anlegen('adset').id })
        if (req.method === 'POST' && /^act_\w+\/adcreatives$/.test(rest)) return sende(res, 200, { id: anlegen('creative').id })
        if (req.method === 'POST' && /^act_\w+\/ads$/.test(rest)) return sende(res, 200, { id: anlegen('ad').id })
        if (req.method === 'POST' && /^act_\w+\/adimages$/.test(rest)) {
          if (!werte.bytes) return sende(res, 400, { error: { message: 'bytes fehlt' } })
          return sende(res, 200, { images: { 'bild.jpg': { hash: `hash-${log.meta.length}` } } })
        }
        if (req.method === 'POST' && /^\w+\/events$/.test(rest)) {
          const data = JSON.parse(werte.data || '[]')
          log.capi.push(...data)
          return sende(res, 200, { events_received: data.length })
        }
        const o = meta.objekte.get(rest)
        if (!o) return sende(res, 400, { error: { message: `Unsupported get request. Object with ID '${rest}' does not exist`, code: 100 } })
        if (req.method === 'GET') {
          const antwort = { id: o.id }
          for (const f of (werte.fields || '').split(',').filter(Boolean)) antwort[f] = o[f]
          return sende(res, 200, antwort)
        }
        Object.assign(o, werte)
        return sende(res, 200, { success: true })
      }
      sende(res, 404, { fehler: `Attrappe kennt ${req.method} ${url.pathname} nicht` })
    } catch (e) {
      sende(res, 500, { fehler: e.message })
    }
  })
  await new Promise((r) => server.listen(port, '127.0.0.1', r))
  return { basis, log, meta, wissenQuelle: wissen ? 'IG-Wissen-Klon' : 'Notfall-Texte', schliessen: () => new Promise((r) => server.close(r)) }
}
