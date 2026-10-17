import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { Meldung } from '../components/Teile.jsx'

export default function Login() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState(null)
  const [laeuft, setLaeuft] = useState(false)

  async function senden(e) {
    e.preventDefault()
    setLaeuft(true)
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
    setLaeuft(false)
    setStatus(error ? { art: 'fehler', text: error.message } : { art: 'ok', text: 'Schau in dein Postfach. Der Link meldet dich direkt an.' })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-forest px-4">
      <form onSubmit={senden} className="w-full max-w-sm rounded-2xl bg-cream p-6 shadow-lg">
        <img src="/favicon.svg" alt="" className="mb-4 h-12 w-12" />
        <h1 className="text-3xl">Partner-Ads</h1>
        <p className="mb-5 mt-1 text-sm text-forest/70">Meta-Anzeigen für neue Franchise-Partner. Melde dich mit deiner immergrün-Adresse an.</p>
        <label className="label" htmlFor="email">E-Mail</label>
        <input id="email" type="email" required autoComplete="email" className="feld" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@mein-immergruen.de" />
        <button className="knopf-haupt mt-4 w-full" disabled={laeuft}>{laeuft ? 'Sende Link …' : 'Login-Link senden'}</button>
        <div className="mt-4"><Meldung art={status?.art}>{status?.text}</Meldung></div>
      </form>
    </div>
  )
}
