import { supabase } from './supabase.js'

async function token() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token
}

/** Ruft eine Netlify-Function mit dem Login des Nutzers auf. */
export async function funktion(name, { body, methode = 'POST', query } = {}) {
  const url = `/.netlify/functions/${name}${query ? `?${new URLSearchParams(query)}` : ''}`
  const r = await fetch(url, {
    method: methode,
    headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const daten = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(daten.fehler || `Fehler ${r.status}`)
  return daten
}

const JOB_FUNKTION = {
  texte: 'texte-erzeugen-background',
  medien: 'medien-erzeugen-background',
  kampagne_anlegen: 'kampagne-anlegen-background',
}

/**
 * Startet eine lange Arbeit im Hintergrund und wartet, bis sie fertig ist.
 * beimFortschritt erhält Zwischenstände wie "Bild 4:5 wird erzeugt".
 */
export async function jobAusfuehren(art, eingabe, beimFortschritt = () => {}) {
  const { data: user } = await supabase.auth.getUser()
  const { data: job, error } = await supabase
    .from('ads_jobs').insert({ art, eingabe, erstellt_von: user.user.id }).select().single()
  if (error) throw new Error(error.message)

  const r = await fetch(`/.netlify/functions/${JOB_FUNKTION[art]}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jobId: job.id }),
  })
  if (!r.ok && r.status !== 202) throw new Error(`Start fehlgeschlagen (${r.status})`)

  const start = Date.now()
  while (Date.now() - start < 15 * 60 * 1000) {
    await new Promise((ok) => setTimeout(ok, 2500))
    const { data: stand } = await supabase.from('ads_jobs').select('status, ergebnis, fehler').eq('id', job.id).single()
    if (stand?.status === 'fertig') return stand.ergebnis
    if (stand?.status === 'fehler') throw new Error(stand.fehler || 'Unbekannter Fehler')
    if (stand?.ergebnis?.fortschritt) beimFortschritt(stand.ergebnis.fortschritt)
  }
  throw new Error('Das dauert ungewöhnlich lange. Schau später noch einmal nach.')
}
