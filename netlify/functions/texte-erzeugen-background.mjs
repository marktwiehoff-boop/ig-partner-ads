// Background-Function: erzeugt Anzeigentexte mit Claude und IG-Wissen und
// legt sie als Entwürfe an. Freigeben muss danach ein Mensch.

import { backgroundJob } from './lib/jobs.mjs'
import { serviceClient, pruefe } from './lib/supabase.mjs'
import { ladeMarkenwissen } from './lib/igwissen.mjs'
import { erzeugeTexte } from './lib/claude.mjs'
import { MOTIV_SCHLUESSEL } from '../../shared/motive.js'

export async function texteErzeugen(job, user, { wissenLaden = ladeMarkenwissen, texte = erzeugeTexte } = {}) {
  const e = job.eingabe || {}
  const motive = (e.motive || []).filter((m) => MOTIV_SCHLUESSEL.includes(m))
  if (motive.length === 0) throw new Error('Bitte wähle mindestens ein Motiv.')
  const anzahl = Math.min(Math.max(Number(e.anzahl_je_motiv) || 1, 1), 3)
  if (motive.length * anzahl > 8) throw new Error('Höchstens 8 Varianten auf einmal.')

  const sb = serviceClient()
  const region = pruefe(await sb.from('ads_regions').select('*').eq('id', e.region_id).single(), 'Region laden')
  let vorlage = null
  if (e.vorlage_creative_id) {
    const c = pruefe(await sb.from('ads_creatives').select('motiv, hook, haupttext, ueberschrift, cta_typ, bild_idee').eq('id', e.vorlage_creative_id).single(), 'Vorlage laden')
    vorlage = c
  }

  const wissen = await wissenLaden()
  const varianten = await texte({ wissen, region, motive, anzahlJeMotiv: anzahl, hinweis: (e.hinweis || '').slice(0, 500), vorlage })

  const zeilen = varianten.map((v) => ({
    region_id: region.id,
    motiv: v.motiv,
    hook: v.hook,
    haupttext: v.haupttext,
    ueberschrift: v.ueberschrift,
    cta_typ: v.cta_typ,
    bild_idee: v.bild_idee,
    erstellt_von: user.id,
    markencheck: { hinweise: v.markencheck.hinweise, quellen: v.quellen || [] },
  }))
  const neu = pruefe(await sb.from('ads_creatives').insert(zeilen).select('id'), 'Entwürfe speichern')
  return { creative_ids: neu.map((n) => n.id), wissen_dateien: wissen.dateien }
}

export default backgroundJob('texte', (job, user) => texteErzeugen(job, user))
