// Zeitplan: alle 15 Minuten den Autopiloten anstoßen. Die Arbeit selbst läuft
// in autopilot-arbeit-background (bis 15 Minuten), weil eine geplante
// Function nur wenige Sekunden laufen darf.
import { hintergrundStarten } from './lib/intern.mjs'

export default async () => {
  try {
    const status = await hintergrundStarten('autopilot-arbeit-background', { quelle: 'zeitplan' })
    console.log('[autopilot-tick] gestartet', status)
  } catch (e) {
    console.error('[autopilot-tick]', e)
  }
}

export const config = { schedule: '*/15 * * * *' }
