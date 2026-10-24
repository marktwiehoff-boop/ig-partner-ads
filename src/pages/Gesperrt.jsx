import { useAuth } from '../context/Auth.jsx'
import logoWeiss from '../assets/logo-weiss.svg'

export function NichtFreigeschaltet() {
  const { session, abmelden } = useAuth()
  return (
    <div className="min-h-dvh bg-ig-story text-white">
      <div className="mx-auto max-w-md px-5 pb-10 pt-[max(40px,env(safe-area-inset-top))]">
        <img src={logoWeiss} alt="immergrün" className="h-10" />
        <h1 className="mt-10 font-display text-[36px] leading-[1.1] text-white">Fast geschafft</h1>
        <p className="mt-3 text-[17px] text-white/75">
          Du bist als <strong className="text-white">{session?.user?.email}</strong> angemeldet, aber für Partner-Ads noch nicht freigeschaltet. Bitte Mark, dich unter „Nutzer“ hinzuzufügen.
        </p>
        <button onClick={abmelden} className="knopf mt-8 h-12 w-full border border-white/20 bg-white/10 text-white hover:bg-white/15">Abmelden</button>
      </div>
    </div>
  )
}

export function NichtKonfiguriert() {
  return (
    <div className="mx-auto max-w-lg p-6">
      <h1 className="text-2xl">Einrichtung fehlt</h1>
      <p className="mt-2 text-sm">VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY sind nicht gesetzt. Trage sie in Netlify unter Umgebungsvariablen ein und baue die Seite neu.</p>
    </div>
  )
}
