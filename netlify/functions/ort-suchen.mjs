// Koordinaten zu einem Ortsnamen (OpenStreetMap Nominatim), damit Rick
// Städte per Name hinzufügen kann. Ohne Schlüssel, nur Deutschland.
import { handler, json, HttpFehler } from './lib/antwort.mjs'
import { nutzerPruefen } from './lib/auth.mjs'

export default handler(async (req) => {
  await nutzerPruefen(req)
  const q = new URL(req.url).searchParams.get('q')?.trim()
  if (!q || q.length < 2) throw new HttpFehler(400, 'Bitte gib einen Ort ein.')
  const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=de&limit=5&addressdetails=0&q=${encodeURIComponent(q)}`
  const r = await fetch(url, { headers: { 'user-agent': 'ig-partner-ads (immergrün Franchise GmbH)', 'accept-language': 'de' } })
  if (!r.ok) throw new HttpFehler(502, 'Ortssuche gerade nicht erreichbar.')
  const treffer = (await r.json()).map((t) => ({
    name: t.display_name.split(',')[0],
    beschreibung: t.display_name,
    lat: Math.round(Number(t.lat) * 10000) / 10000,
    lng: Math.round(Number(t.lon) * 10000) / 10000,
  }))
  return json(200, { treffer })
})
