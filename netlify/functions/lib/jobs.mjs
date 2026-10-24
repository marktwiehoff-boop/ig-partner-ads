import { serviceClient, pruefe } from './supabase.mjs'
import { nutzerPruefen } from './auth.mjs'

/**
 * Rahmen für Background-Functions. Netlify antwortet sofort mit 202, alles
 * Weitere landet in der Zeile ads_jobs, die die Oberfläche beobachtet.
 */
export function backgroundJob(art, arbeit) {
  return async (req) => {
    let jobId
    try {
      const body = await req.json().catch(() => ({}))
      jobId = body.jobId
      if (!jobId) throw new Error('jobId fehlt')
      const { user } = await nutzerPruefen(req)
      const sb = serviceClient()
      const job = pruefe(await sb.from('ads_jobs').select('*').eq('id', jobId).single(), 'Job laden')
      if (job.art !== art) throw new Error(`Job ist vom Typ ${job.art}, erwartet ${art}`)
      if (job.erstellt_von !== user.id) throw new Error('Dieser Job gehört jemand anderem.')
      if (job.status !== 'wartet') throw new Error('Dieser Job läuft schon oder ist fertig.')
      await setzeJob(jobId, { status: 'laeuft' })
      const ergebnis = await arbeit(job, user, (fortschritt) => setzeJob(jobId, { ergebnis: { fortschritt } }))
      await setzeJob(jobId, { status: 'fertig', ergebnis })
    } catch (e) {
      console.error(`[${art}]`, e)
      if (jobId) await setzeJob(jobId, { status: 'fehler', fehler: e.message }).catch(() => {})
    }
  }
}

export async function setzeJob(id, felder) {
  const sb = serviceClient()
  pruefe(await sb.from('ads_jobs').update({ ...felder, updated_at: new Date().toISOString() }).eq('id', id), 'Job speichern')
}
