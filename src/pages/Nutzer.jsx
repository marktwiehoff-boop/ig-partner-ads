import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { Seite, Meldung, Laden } from '../components/Teile.jsx'

const ROLLEN = { admin: 'Admin (Budget, Obergrenzen, Nutzer)', expansion: 'Expansion (bedienen, freigeben)', viewer: 'Nur lesen' }

export default function Nutzer() {
  const [liste, setListe] = useState(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [rolle, setRolle] = useState('viewer')
  const [meldung, setMeldung] = useState(null)

  const laden = useCallback(async () => {
    const { data } = await supabase.from('ads_users').select('*').order('email')
    setListe(data || [])
  }, [])
  useEffect(() => { laden() }, [laden])

  async function setzen(e, werte) {
    e?.preventDefault()
    const { error } = await supabase.rpc('ads_nutzer_setzen', { p_email: werte.email, p_rolle: werte.rolle, p_name: werte.name || null })
    setMeldung(error ? { art: 'fehler', text: error.message } : { art: 'ok', text: `${werte.email} ist jetzt ${werte.rolle}.` })
    if (!error) { setEmail(''); setName(''); laden() }
  }

  return (
    <Seite titel="Nutzer" unter="Wer die App sehen und bedienen darf.">
      <form className="karte grid gap-3 md:grid-cols-4" onSubmit={(e) => setzen(e, { email, rolle, name })}>
        <div className="md:col-span-2">
          <label className="label" htmlFor="n-email">E-Mail</label>
          <input id="n-email" type="email" required className="feld" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="n-name">Name</label>
          <input id="n-name" className="feld" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="n-rolle">Rolle</label>
          <select id="n-rolle" className="feld" value={rolle} onChange={(e) => setRolle(e.target.value)}>
            {Object.entries(ROLLEN).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </div>
        <div className="md:col-span-4">
          <button className="knopf-haupt">Hinzufügen oder ändern</button>
          <p className="mt-2 text-xs text-forest/60">Die Person muss sich vorher einmal mit dem Login-Link angemeldet haben.</p>
        </div>
      </form>
      <div className="mt-3"><Meldung art={meldung?.art}>{meldung?.text}</Meldung></div>
      {!liste ? <Laden /> : (
        <ul className="karte mt-4 divide-y divide-forest/10">
          {liste.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><strong>{n.name || n.email}</strong> <span className="text-sm text-forest/60">{n.email}</span></span>
              <select aria-label={`Rolle von ${n.email}`} className="feld w-auto" value={n.rolle} onChange={(e) => setzen(null, { email: n.email, rolle: e.target.value })}>
                {Object.entries(ROLLEN).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
            </li>
          ))}
        </ul>
      )}
    </Seite>
  )
}
