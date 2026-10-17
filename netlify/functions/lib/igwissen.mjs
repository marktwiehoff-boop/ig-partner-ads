// Lädt Markenstimme und Markenwissen aus dem IG-Wissen-Repo (GitHub).
// Pflichtquelle: Ohne dieses Wissen erzeugt die App keine Texte.

const STANDARD_PFADE = ['content/01_Marke_Branding', 'content/03_Partner_Expansion']
const CACHE_MS = 10 * 60 * 1000
let cache = null

export async function ladeMarkenwissen({ fetchFn = fetch, jetzt = Date.now() } = {}) {
  if (cache && jetzt - cache.zeit < CACHE_MS) return cache.wert

  const repo = process.env.IGWISSEN_REPO || 'marktwiehoff-boop/igwissen'
  const ref = process.env.IGWISSEN_BRANCH || 'main'
  const token = process.env.IGWISSEN_TOKEN
  if (!token) throw new Error('IGWISSEN_TOKEN fehlt in Netlify. Ohne Markenwissen erzeugt die App keine Texte.')
  const pfade = (process.env.IGWISSEN_PFADE || STANDARD_PFADE.join(',')).split(',').map((p) => p.trim()).filter(Boolean)

  const kopf = { authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28', 'user-agent': 'ig-partner-ads' }
  const holen = async (pfad, roh) => {
    const url = `https://api.github.com/repos/${repo}/contents/${encodeURI(pfad)}?ref=${encodeURIComponent(ref)}`
    const r = await fetchFn(url, { headers: { ...kopf, accept: roh ? 'application/vnd.github.raw' : 'application/vnd.github+json' } })
    if (!r.ok) throw new Error(`IG-Wissen: ${pfad} nicht lesbar (HTTP ${r.status}).`)
    return roh ? r.text() : r.json()
  }

  const dateien = []
  for (const pfad of pfade) {
    if (pfad.endsWith('.md')) {
      dateien.push(pfad)
      continue
    }
    const liste = await holen(pfad, false)
    for (const e of Array.isArray(liste) ? liste : []) {
      if (e.type === 'file' && e.name.endsWith('.md')) dateien.push(e.path)
    }
  }
  dateien.sort()
  if (dateien.length === 0) throw new Error('IG-Wissen: keine Markdown-Dateien gefunden.')

  const teile = []
  for (const d of dateien) {
    const text = await holen(d, true)
    teile.push(`<dokument pfad="${d}">\n${text.trim()}\n</dokument>`)
  }
  const wert = { text: teile.join('\n\n'), dateien }
  if (!wert.dateien.some((d) => d.includes('markenstimme'))) {
    throw new Error('IG-Wissen: Die Markenstimme (immergruen-markenstimme.md) fehlt.')
  }
  cache = { zeit: jetzt, wert }
  return wert
}

export function leereWissenCache() {
  cache = null
}
