import { useAuth } from '../context/Auth.jsx'

export function NichtFreigeschaltet() {
  const { session, abmelden } = useAuth()
  return (
    <div className="flex min-h-screen items-center justify-center bg-forest px-4">
      <div className="w-full max-w-sm rounded-2xl bg-cream p-6">
        <h1 className="text-2xl">Fast geschafft</h1>
        <p className="mt-2 text-sm">Du bist als <strong>{session?.user?.email}</strong> angemeldet, aber für Partner-Ads noch nicht freigeschaltet. Bitte Mark, dich unter „Nutzer“ hinzuzufügen.</p>
        <button onClick={abmelden} className="knopf-rand mt-4 w-full">Abmelden</button>
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
