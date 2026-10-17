// Kleiner Nachbau des Supabase-Clients im Speicher. Kann genau das, was die
// Server-Funktionen nutzen.
import { randomUUID } from 'node:crypto'

export function fakeSupabase(start = {}) {
  const db = structuredClone(start)
  const tab = (t) => (db[t] ||= [])
  const auth = { users: {} }

  function abfrage(tabelle) {
    let filter = []
    let aktion = { art: 'select' }
    let einzel = null
    let rueckgabe = false
    const q = {
      select() { if (aktion.art !== 'select') rueckgabe = true; return q },
      eq(f, w) { filter.push((z) => z[f] === w); return q },
      is(f, w) { filter.push((z) => (z[f] ?? null) === w); return q },
      gte(f, w) { filter.push((z) => z[f] >= w); return q },
      or(ausdruck) {
        const teile = ausdruck.split(',').map((t) => t.split('.')[0])
        filter.push((z) => teile.some((f) => z[f] != null))
        return q
      },
      single() { einzel = 'single'; return q },
      maybeSingle() { einzel = 'maybe'; return q },
      insert(werte) { aktion = { art: 'insert', werte: [].concat(werte) }; return q },
      update(werte) { aktion = { art: 'update', werte }; return q },
      upsert(werte, { onConflict } = {}) { aktion = { art: 'upsert', werte: [].concat(werte), onConflict }; return q },
      then(ok, nein) { return Promise.resolve(ausfuehren()).then(ok, nein) },
    }
    function ausfuehren() {
      const t = tab(tabelle)
      let ergebnis
      if (aktion.art === 'select') ergebnis = t.filter((z) => filter.every((f) => f(z)))
      if (aktion.art === 'insert') {
        ergebnis = aktion.werte.map((w) => ({ id: randomUUID(), ...w }))
        t.push(...ergebnis)
      }
      if (aktion.art === 'update') {
        ergebnis = t.filter((z) => filter.every((f) => f(z)))
        for (const z of ergebnis) Object.assign(z, aktion.werte)
      }
      if (aktion.art === 'upsert') {
        const schluessel = (aktion.onConflict || 'id').split(',')
        ergebnis = aktion.werte.map((w) => {
          const da = t.find((z) => schluessel.every((s) => z[s] === w[s]))
          if (da) return Object.assign(da, w)
          const neu = { id: randomUUID(), ...w }
          t.push(neu)
          return neu
        })
      }
      if (aktion.art !== 'select' && !rueckgabe && !einzel) return { data: null, error: null }
      if (einzel === 'single') return ergebnis.length === 1 ? { data: ergebnis[0], error: null } : { data: null, error: { message: `erwartet 1 Zeile in ${tabelle}, gefunden ${ergebnis.length}` } }
      if (einzel === 'maybe') return { data: ergebnis[0] || null, error: null }
      return { data: ergebnis, error: null }
    }
    return q
  }

  const storage = {
    dateien: {},
    from: (bucket) => ({
      upload: async (pfad, daten) => { storage.dateien[`${bucket}/${pfad}`] = daten; return { data: { path: pfad }, error: null } },
      getPublicUrl: (pfad) => ({ data: { publicUrl: `https://speicher.test/${bucket}/${pfad}` } }),
    }),
  }

  return {
    db,
    storage,
    from: abfrage,
    auth: {
      _users: auth.users,
      getUser: async (token) => (auth.users[token] ? { data: { user: auth.users[token] }, error: null } : { data: null, error: { message: 'ungültig' } }),
    },
  }
}
