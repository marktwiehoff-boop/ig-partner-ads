// Background-Function: erzeugt Bilder (1:1, 4:5, 9:16) und optional einen
// Clip (9:16) mit Higgsfield und legt sie dauerhaft in Supabase Storage ab.

import { backgroundJob } from './lib/jobs.mjs'
import { serviceClient, pruefe } from './lib/supabase.mjs'
import { erzeugeBild, erzeugeClip, FORMATE } from './lib/higgsfield.mjs'
import { pruefeCreative } from '../../shared/markenregeln.js'

const BUCKET = 'ads-medien'

async function ablegen(sb, quelleUrl, pfad, fetchFn = fetch) {
  const r = await fetchFn(quelleUrl)
  if (!r.ok) throw new Error(`Datei von Higgsfield nicht ladbar (HTTP ${r.status}).`)
  const typ = r.headers.get('content-type') || 'application/octet-stream'
  const daten = new Uint8Array(await r.arrayBuffer())
  pruefe(await sb.storage.from(BUCKET).upload(pfad, daten, { contentType: typ, upsert: true }), 'Datei speichern')
  return sb.storage.from(BUCKET).getPublicUrl(pfad).data.publicUrl
}

function endung(url, standard) {
  const m = new URL(url).pathname.match(/\.(jpe?g|png|webp|mp4|mov)$/i)
  return m ? m[1].toLowerCase() : standard
}

export async function medienErzeugen(job, _user, melden = async () => {}, deps = {}) {
  const bild = deps.erzeugeBild || erzeugeBild
  const clip = deps.erzeugeClip || erzeugeClip
  const e = job.eingabe || {}
  const formate = (e.formate?.length ? e.formate : FORMATE).filter((f) => FORMATE.includes(f))
  const sb = serviceClient()
  const c = pruefe(await sb.from('ads_creatives').select('*').eq('id', e.creative_id).single(), 'Anzeige laden')
  if (c.meta_ad_id) throw new Error('Diese Anzeige liegt schon bei Meta. Lege eine neue Variante an.')
  if (!c.bild_idee?.trim()) throw new Error('Die Anzeige hat keine Bildidee.')
  if (pruefeCreative(c).verstoesse.includes('Gelb in der Bildidee')) throw new Error('Die Bildidee enthält Gelb. Bitte ändern.')

  const zeit = Date.now()
  const medien = []
  for (const format of formate) {
    await melden(`Bild ${format} wird erzeugt`)
    const b = await bild(c.bild_idee, format)
    const url = await ablegen(sb, b.url, `${c.id}/${zeit}-${format.replace(':', 'x')}.${endung(b.url, 'jpg')}`, deps.fetchFn)
    medien.push({ format: b.format || format, typ: 'bild', url, quelle: 'higgsfield', request_id: b.requestId })
  }
  if (e.mit_clip) {
    const start = medien.find((m) => m.format === '9:16') || medien[0]
    if (start) {
      await melden('Clip 9:16 wird erzeugt')
      const v = await clip(c.bild_idee, start.url)
      const url = await ablegen(sb, v.url, `${c.id}/${zeit}-clip-9x16.${endung(v.url, 'mp4')}`, deps.fetchFn)
      medien.push({ format: '9:16', typ: 'video', url, vorschau: start.url, quelle: 'higgsfield', request_id: v.requestId })
    }
  }

  // Neue Medien ersetzen alte gleichen Typs und Formats. Ändert sich ein
  // freigegebenes Creative, setzt die Datenbank es wieder auf Entwurf.
  const bleiben = (c.medien || []).filter((alt) => !medien.some((n) => n.typ === alt.typ && n.format === alt.format))
  pruefe(await sb.from('ads_creatives').update({ medien: [...bleiben, ...medien] }).eq('id', c.id), 'Medien speichern')
  return { anzahl: medien.length }
}

export default backgroundJob('medien', (job, user, melden) => medienErzeugen(job, user, melden))
