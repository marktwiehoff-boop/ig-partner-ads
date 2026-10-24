// Geplante Function: holt jeden Morgen die Meta-Kennzahlen.
import { kennzahlenAbholen } from './lib/kennzahlen.mjs'

export default async () => {
  try {
    const r = await kennzahlenAbholen()
    console.log('[kennzahlen-taeglich]', JSON.stringify(r))
  } catch (e) {
    console.error('[kennzahlen-taeglich]', e)
  }
}

// 05:15 UTC = 07:15 Uhr Sommerzeit, 06:15 Uhr Winterzeit
export const config = { schedule: '15 5 * * *' }
