// Bilder und kurze Clips über die Higgsfield API (api.higgsfield.ai).
// Ablauf: Auftrag senden, request_id erhalten, Status abfragen bis fertig.

import { BILDSTIL } from '../../../shared/markenregeln.js'

// Higgsfield nennt api.higgsfield.ai (SDK) und platform.higgsfield.ai (ältere Doku).
const basis = () => (process.env.HF_BASIS_URL || 'https://api.higgsfield.ai').replace(/\/$/, '')
export const FORMATE = ['1:1', '4:5', '9:16']

function zugang() {
  const c = process.env.HF_CREDENTIALS
  if (!c || !c.includes(':')) throw new Error('HF_CREDENTIALS fehlt in Netlify (Format KEY_ID:KEY_SECRET).')
  return c
}

async function anfrage(pfad, { methode = 'GET', body, fetchFn = fetch } = {}) {
  const url = pfad.startsWith('http') ? pfad : `${basis()}${pfad.startsWith('/') ? pfad : `/${pfad}`}`
  const r = await fetchFn(url, {
    method: methode,
    headers: { authorization: `Key ${zugang()}`, 'content-type': 'application/json', accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let daten
  try {
    daten = text ? JSON.parse(text) : {}
  } catch {
    daten = { roh: text }
  }
  if (!r.ok) throw new Error(`Higgsfield ${r.status}: ${fehlertext(daten, text)}`)
  return daten
}

export async function warteAufErgebnis(requestId, { fetchFn = fetch, pause = 4000, maxVersuche = 150, schlafen = schlaf } = {}) {
  for (let i = 0; i < maxVersuche; i++) {
    const s = await anfrage(`/requests/${requestId}/status`, { fetchFn })
    if (s.status === 'completed') return s
    if (s.status === 'failed') throw new Error('Higgsfield: Erzeugung fehlgeschlagen (Guthaben wird erstattet).')
    if (s.status === 'nsfw') throw new Error('Higgsfield: Bild von der Moderation abgelehnt. Passe die Bildidee an.')
    await schlafen(pause)
  }
  throw new Error('Higgsfield: Zeitüberschreitung beim Warten auf das Ergebnis.')
}

export function bildPrompt(bildIdee) {
  return `${bildIdee.trim()}. ${BILDSTIL}`
}

/** Higgsfield meldet Fehler oft als Liste { loc, msg }. Lesbar machen. */
export function fehlertext(daten, roh = '') {
  const d = daten?.detail ?? daten?.message ?? daten?.error
  if (Array.isArray(d)) return d.map((x) => [x.loc?.slice(1).join('.'), x.msg].filter(Boolean).join(': ')).join(' | ')
  if (d && typeof d === 'object') return JSON.stringify(d).slice(0, 300)
  return String(d || roh).slice(0, 300)
}

// Soul kennt kein 4:5. 3:4 ist das nächste Hochformat, Meta schneidet im Feed
// minimal auf 4:5 zu. Andere Modelle bekommen das Format unverändert.
const SOUL_FORMATE = { '4:5': '3:4' }

export function modellFormat(modell, format) {
  return modell.includes('/soul') ? (SOUL_FORMATE[format] || format) : format
}

export async function erzeugeBild(bildIdee, format, opts = {}) {
  const modell = process.env.HF_BILD_MODELL || 'higgsfield-ai/soul/standard'
  const body = { prompt: bildPrompt(bildIdee), aspect_ratio: modellFormat(modell, format) }
  if (opts.referenzUrl) body.image_reference = { type: 'image_url', image_url: opts.referenzUrl }

  let start
  let ohneReferenz = false
  try {
    start = await anfrage(modell, { methode: 'POST', body, fetchFn: opts.fetchFn })
  } catch (e) {
    // Kennt das Modell keine Bildvorlage, lieber ohne Vorlage als gar kein Bild.
    if (!opts.referenzUrl || !/422/.test(e.message) || !/image_reference|extra/i.test(e.message)) throw e
    delete body.image_reference
    ohneReferenz = true
    start = await anfrage(modell, { methode: 'POST', body, fetchFn: opts.fetchFn })
  }
  if (!start.request_id) throw new Error('Higgsfield hat keine request_id geliefert.')
  const fertig = start.status === 'completed' ? start : await warteAufErgebnis(start.request_id, opts)
  const url = fertig.images?.[0]?.url
  if (!url) throw new Error('Higgsfield hat kein Bild geliefert.')
  return { url, requestId: start.request_id, format: modellFormat(modell, format), ohneReferenz }
}

export async function erzeugeClip(bildIdee, startbildUrl, opts = {}) {
  const modell = process.env.HF_VIDEO_MODELL || '/v1/image2video/dop'
  const start = await anfrage(modell, {
    methode: 'POST',
    body: {
      model: 'dop-turbo',
      prompt: `Ruhige, natürliche Kamerabewegung. ${bildPrompt(bildIdee)}`,
      input_images: [{ type: 'image_url', image_url: startbildUrl }],
    },
    fetchFn: opts.fetchFn,
  })
  if (!start.request_id) throw new Error('Higgsfield hat keine request_id geliefert.')
  const fertig = start.status === 'completed' ? start : await warteAufErgebnis(start.request_id, opts)
  const url = fertig.video?.url
  if (!url) throw new Error('Higgsfield hat keinen Clip geliefert.')
  return { url, requestId: start.request_id }
}

function schlaf(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
