// Spielt die SQL-Nachträge aus supabase/migrations selbst ein, damit niemand
// mehr SQL von Hand in den Supabase SQL-Editor einfügen muss.
//
// Läuft beim Netlify-Build (siehe netlify.toml) und braucht dafür nur die
// Variable SUPABASE_DB_URL (Session-Pooler-Adresse aus Supabase, Bereich
// Builds). Ohne die Variable passiert nichts, der Build läuft normal weiter.
//
// Regeln:
// - Nur im Produktions-Build (CONTEXT=production) oder mit --erzwingen.
// - Jede Datei läuft als Ganzes oder gar nicht (Transaktion).
// - Die Tabelle ads_migrationen merkt sich, was eingespielt ist.
// - Wurde die Datenbank früher von Hand eingerichtet, erkennt das Werkzeug
//   das am Bestand (Tabellen und Funktionen der jeweiligen Datei) und
//   übernimmt diese Dateien als "schon eingespielt".
// - Ein echter Fehler bricht den Build ab: Dann geht keine Version online,
//   deren Datenbank nicht passt.

import { readFileSync, readdirSync } from 'node:fs'
import pg from 'pg'

const ORDNER = new URL('../supabase/migrations/', import.meta.url)

export function migrationsDateien(ordner = ORDNER) {
  return readdirSync(ordner).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort()
    .map((name) => ({ name, sql: readFileSync(new URL(name, ordner), 'utf8') }))
}

/** Tabellen und Funktionen, die eine Datei neu anlegt (für die Bestandsaufnahme). */
export function angelegteObjekte(sql) {
  const tabellen = [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)].map((m) => m[1].toLowerCase())
  const funktionen = [...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi)].map((m) => m[1].toLowerCase())
  const policies = [...sql.matchAll(/create\s+policy\s+([a-z_][a-z0-9_]*)\s+on\s+(?:public\.)?([a-z_][a-z0-9_.]*)/gi)].map((m) => [m[1].toLowerCase(), m[2].toLowerCase()])
  const buckets = [...sql.matchAll(/insert\s+into\s+storage\.buckets[\s\S]*?values\s*\(\s*'([^']+)'/gi)].map((m) => m[1])
  return { tabellen: [...new Set(tabellen)], funktionen: [...new Set(funktionen)], policies, buckets: [...new Set(buckets)] }
}

async function bestandVorhanden(client, { tabellen, funktionen, policies, buckets }) {
  for (const t of tabellen) {
    const r = await client.query('select to_regclass($1) as o', [`public.${t}`])
    if (r.rows[0].o) return true
  }
  for (const f of funktionen) {
    const r = await client.query('select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = $1 and p.proname = $2', ['public', f])
    if (r.rows[0].n > 0) return true
  }
  for (const [name, tabelle] of policies) {
    const [schema, rel] = tabelle.includes('.') ? tabelle.split('.') : ['public', tabelle]
    const r = await client.query('select count(*)::int as n from pg_policies where schemaname = $1 and tablename = $2 and policyname = $3', [schema, rel, name])
    if (r.rows[0].n > 0) return true
  }
  for (const b of buckets) {
    const r = await client.query("select to_regclass('storage.buckets') as o")
    if (!r.rows[0].o) continue
    const z = await client.query('select count(*)::int as n from storage.buckets where id = $1', [b])
    if (z.rows[0].n > 0) return true
  }
  return false
}

/**
 * Welche Dateien sind schon da, obwohl ads_migrationen leer ist?
 * Von Hand wurde immer "alles bis Datei N" eingespielt. Also gilt: alle
 * Dateien bis zur letzten, deren Objekte existieren, sind eingespielt.
 */
export async function bestandUebernehmen(client, dateien) {
  let letzte = -1
  for (let i = 0; i < dateien.length; i++) {
    if (await bestandVorhanden(client, angelegteObjekte(dateien[i].sql))) letzte = i
  }
  const uebernommen = dateien.slice(0, letzte + 1).map((d) => d.name)
  for (const name of uebernommen) {
    await client.query('insert into ads_migrationen (name, hinweis) values ($1, $2) on conflict do nothing', [name, 'Bestand: schon von Hand eingespielt'])
  }
  return uebernommen
}

export async function migrieren(client, { dateien = migrationsDateien(), log = console.log } = {}) {
  await client.query('select pg_advisory_lock(hashtext($1))', ['ads_migrationen'])
  try {
    await client.query(`create table if not exists ads_migrationen (
      name text primary key,
      angewendet_am timestamptz not null default now(),
      hinweis text
    )`)
    await client.query('revoke all on ads_migrationen from anon, authenticated')
    const bekannt = new Set((await client.query('select name from ads_migrationen')).rows.map((r) => r.name))
    if (bekannt.size === 0) {
      const uebernommen = await bestandUebernehmen(client, dateien)
      for (const n of uebernommen) bekannt.add(n)
      if (uebernommen.length) log(`Bestand übernommen: ${uebernommen.join(', ')}`)
    }

    const neu = []
    for (const d of dateien) {
      if (bekannt.has(d.name)) continue
      log(`Spiele ein: ${d.name}`)
      await client.query('begin')
      try {
        await client.query(d.sql)
        await client.query('insert into ads_migrationen (name) values ($1)', [d.name])
        await client.query('commit')
      } catch (e) {
        await client.query('rollback')
        throw new Error(`${d.name}: ${e.message}`)
      }
      neu.push(d.name)
    }
    return { neu, bekannt: [...bekannt] }
  } finally {
    await client.query('select pg_advisory_unlock(hashtext($1))', ['ads_migrationen'])
  }
}

export function verbindung(url) {
  // Kein new URL(): Socket-Adressen wie postgres://postgres@/db?host=/pfad gelten dort nicht als gültig.
  const sslmode = (url.match(/[?&]sslmode=([^&]*)/) || [])[1]
  const bereinigt = url.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '')
  const host = (url.match(/@([^/?:]*)/) || [])[1] || ''
  const lokal = ['localhost', '127.0.0.1', ''].includes(host) || /[?&]host=/.test(url)
  let ssl = false
  if (!lokal && sslmode !== 'disable') {
    // Supabase signiert mit eigener Stammstelle. Mit SUPABASE_DB_CA wird sie geprüft.
    ssl = process.env.SUPABASE_DB_CA ? { ca: process.env.SUPABASE_DB_CA } : { rejectUnauthorized: false }
  }
  return { connectionString: bereinigt, ssl }
}

async function main() {
  const url = process.env.SUPABASE_DB_URL
  const erzwingen = process.argv.includes('--erzwingen')
  const kontext = process.env.CONTEXT
  if (!url) {
    console.log('SQL-Nachträge: SUPABASE_DB_URL ist nicht gesetzt, Datenbank bleibt wie sie ist. (Anleitung: README, Schritt 2.)')
    return
  }
  if (!erzwingen && kontext && kontext !== 'production') {
    console.log(`SQL-Nachträge: Build-Kontext "${kontext}", nur der Produktions-Build ändert die Datenbank.`)
    return
  }
  const client = new pg.Client(verbindung(url))
  await client.connect()
  try {
    const { neu } = await migrieren(client)
    console.log(neu.length ? `SQL-Nachträge eingespielt: ${neu.join(', ')}` : 'SQL-Nachträge: Datenbank ist auf dem Stand.')
  } finally {
    await client.end()
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((e) => {
    console.error(`SQL-Nachträge fehlgeschlagen: ${e.message}`)
    process.exit(1)
  })
}
