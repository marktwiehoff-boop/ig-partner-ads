// Zugriff auf die Meta Graph / Marketing API mit Systemnutzer-Token.

import { createHmac } from 'node:crypto'

export function metaKonfig() {
  const fehlend = ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_PAGE_ID', 'META_PIXEL_ID'].filter((k) => !process.env[k])
  if (fehlend.length) throw new Error(`In Netlify fehlt: ${fehlend.join(', ')}`)
  const konto = process.env.META_AD_ACCOUNT_ID
  return {
    version: process.env.META_API_VERSION || 'v26.0',
    token: process.env.META_ACCESS_TOKEN,
    appSecret: process.env.META_APP_SECRET || '',
    konto: konto.startsWith('act_') ? konto : `act_${konto}`,
    pageId: process.env.META_PAGE_ID,
    instagramUserId: process.env.META_INSTAGRAM_USER_ID || '',
    pixelId: process.env.META_PIXEL_ID,
    sonderkategorie: process.env.META_SONDERKATEGORIE || '',
    dsaBeguenstigter: process.env.META_DSA_BEGUENSTIGTER || 'immergrün Franchise GmbH',
  }
}

function parameter(cfg, werte) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(werte || {})) {
    if (v === undefined || v === null) continue
    p.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
  }
  p.set('access_token', cfg.token)
  if (cfg.appSecret) p.set('appsecret_proof', createHmac('sha256', cfg.appSecret).update(cfg.token).digest('hex'))
  return p
}

export class MetaFehler extends Error {}

export async function graph(cfg, methode, pfad, werte, { fetchFn = fetch } = {}) {
  const basis = `${process.env.META_GRAPH_URL || 'https://graph.facebook.com'}/${cfg.version}/${pfad.replace(/^\//, '')}`
  const p = parameter(cfg, werte)
  const r =
    methode === 'GET'
      ? await fetchFn(`${basis}?${p}`)
      : await fetchFn(basis, { method: methode, body: p, headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  const daten = await r.json().catch(() => ({}))
  if (!r.ok || daten.error) {
    const e = daten.error || {}
    const text = e.error_user_msg || e.message || `HTTP ${r.status}`
    throw new MetaFehler(`Meta: ${text}${e.error_subcode ? ` (Code ${e.code}/${e.error_subcode})` : ''}`)
  }
  return daten
}

/** Alle Seiten einer Liste abholen (Insights, Anzeigen). */
export async function graphAlle(cfg, pfad, werte, opts = {}) {
  const fetchFn = opts.fetchFn || fetch
  let antwort = await graph(cfg, 'GET', pfad, werte, opts)
  const zeilen = [...(antwort.data || [])]
  let seiten = 0
  while (antwort.paging?.next && seiten++ < 50) {
    const r = await fetchFn(antwort.paging.next)
    antwort = await r.json()
    if (antwort.error) throw new MetaFehler(`Meta: ${antwort.error.message}`)
    zeilen.push(...(antwort.data || []))
  }
  return zeilen
}

export function setzeStatus(cfg, objektId, status, opts) {
  return graph(cfg, 'POST', objektId, { status }, opts)
}
