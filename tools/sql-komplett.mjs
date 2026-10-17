// Fügt alle Migrationen zu einer Datei zusammen, damit die Einrichtung im
// Supabase SQL-Editor mit einem einzigen Einfügen klappt.
// Aufruf: npm run sql:komplett   (Prüfung: npm run sql:komplett -- --pruefen)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

const ordner = 'supabase/migrations'
const ziel = 'supabase/einrichtung-komplett.sql'
const teile = readdirSync(ordner).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => `-- ===== ${f} =====\n${readFileSync(`${ordner}/${f}`, 'utf8').trim()}\n`)
const inhalt = `-- IG Partner-Ads: komplette Einrichtung in einem Schritt.
-- Erzeugt aus supabase/migrations/ (nicht von Hand ändern).
-- Läuft als Ganzes oder gar nicht: Bei einem Fehler wird nichts übernommen.
begin;

${teile.join('\n')}
commit;
`
if (process.argv.includes('--pruefen')) {
  if (readFileSync(ziel, 'utf8') !== inhalt) {
    console.error(`${ziel} ist veraltet. Bitte "npm run sql:komplett" ausführen.`)
    process.exit(1)
  }
  console.log(`${ziel} ist aktuell.`)
} else {
  writeFileSync(ziel, inhalt)
  console.log(`${ziel} geschrieben (${teile.length} Migrationen).`)
}
