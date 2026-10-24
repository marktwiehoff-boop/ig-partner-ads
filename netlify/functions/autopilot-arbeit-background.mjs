// Hintergrundarbeit des Autopiloten. Nur mit internem Geheimnis aufrufbar
// (vom Zeitplan oder vom Knopf "Jetzt weitermachen").
import { internGeprueft } from './lib/intern.mjs'
import { autopilotLauf } from './lib/autopilot.mjs'

export default async (req) => {
  if (!internGeprueft(req)) {
    console.error('[autopilot] Aufruf ohne gültiges Geheimnis abgewiesen')
    return
  }
  try {
    const bericht = await autopilotLauf()
    console.log('[autopilot]', JSON.stringify(bericht))
  } catch (e) {
    console.error('[autopilot]', e)
  }
}
