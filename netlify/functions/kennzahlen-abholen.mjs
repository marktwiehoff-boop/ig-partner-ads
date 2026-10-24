// Knopf "Zahlen jetzt abholen" im Dashboard (admin und expansion).
import { handler, json, HttpFehler } from './lib/antwort.mjs'
import { nutzerPruefen } from './lib/auth.mjs'
import { kennzahlenAbholen } from './lib/kennzahlen.mjs'

export default handler(async (req) => {
  if (req.method !== 'POST') throw new HttpFehler(405, 'Nur POST.')
  await nutzerPruefen(req)
  return json(200, await kennzahlenAbholen())
})
