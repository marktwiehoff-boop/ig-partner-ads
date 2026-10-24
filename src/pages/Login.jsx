import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import logoWeiss from '../assets/logo-weiss.svg'

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
    <div className="min-h-dvh bg-ig-story text-white">
      <div className="mx-auto max-w-md px-5 pb-10 pt-[max(40px,env(safe-area-inset-top))]">
        <img src={logoWeiss} alt="immergrün" className="h-10" />
        <h1 className="mt-10 font-display text-[40px] leading-[1.1] text-white">
          Neue Partner<br />finden, die passen.
        </h1>
        <p className="mt-3 text-[17px] text-white/75">Meta-Anzeigen für die Franchise-Partnersuche. Melde dich mit deiner immergrün-Adresse an.</p>
        <form onSubmit={senden} className="mt-9">
          <label className="mb-1 block text-sm font-bold text-white/80" htmlFor="email">E-Mail</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="name@mein-immergruen.de"
            className="h-12 w-full rounded-xl border border-white/20 bg-white/10 px-3 text-base text-white placeholder:text-white/40 outline-none focus:border-fresh focus:ring-2 focus:ring-fresh/40" />
          <button className="knopf mt-4 h-14 w-full bg-fresh text-base text-forest hover:brightness-95" disabled={laeuft}>
            {laeuft ? 'Sende Link …' : 'Login-Link senden'}
          </button>
          {status && (
            <p role={status.art === 'fehler' ? 'alert' : 'status'} className={`mt-4 rounded-xl px-4 py-3 text-sm ${status.art === 'fehler' ? 'bg-igred/20 text-white' : 'bg-white/10 text-white'}`}>
              {status.text}
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
