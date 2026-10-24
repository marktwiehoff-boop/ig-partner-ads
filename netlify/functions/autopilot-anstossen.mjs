// Knopf "Jetzt weitermachen": startet den Autopilot-Lauf sofort statt in
// bis zu 15 Minuten. Nur admin und expansion.
import { handler, json, HttpFehler } from './lib/antwort.mjs'
import { nutzerPruefen } from './lib/auth.mjs'
import { hintergrundStarten } from './lib/intern.mjs'

export default handler(async (req) => {
  if (req.method !== 'POST') throw new HttpFehler(405, 'Nur POST.')
  const { user } = await nutzerPruefen(req)
  const status = await hintergrundStarten('autopilot-arbeit-background', { quelle: 'knopf', user_id: user.id })
  return json(202, { gestartet: true, status })
})
