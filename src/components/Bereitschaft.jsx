import { useEffect, useState } from 'react'
import { funktion } from '../lib/api.js'

/**
 * Zeigt, was in der Produktion noch fehlt, damit die Partnersuche von allein
 * läuft. Jeder offene Punkt nennt den nächsten Handgriff. Ist alles grün,
 * bleibt nur eine Zeile übrig.
 */
export function Bereitschaft() {
  const [stand, setStand] = useState(null)
  const [fehler, setFehler] = useState(null)
  const [offen, setOffen] = useState(false)

  useEffect(() => {
    funktion('bereitschaft', { methode: 'GET' }).then(setStand).catch((e) => setFehler(e.message))
  }, [])

  if (fehler) return <p className="mb-4 text-xs text-slate-500">Bereitschaft nicht abrufbar: {fehler}</p>
  if (!stand) return null
  const fehlend = stand.punkte.filter((p) => !p.ok)
  if (fehlend.length === 0 && !offen) {
    return (
      <p className="mb-4 text-sm text-ig-700">
        <span className="font-bold">Alles bereit.</span> Datenbank, IG-Wissen, Claude, Higgsfield, Meta und Zeitplan sind angebunden.{' '}
        <button type="button" className="underline" onClick={() => setOffen(true)}>Einzelheiten</button>
      </p>
    )
  }
  return (
    <section className="karte mb-4" aria-label="Bereitschaft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl">{fehlend.length ? `Noch ${fehlend.length} ${fehlend.length === 1 ? 'Schritt' : 'Schritte'}, dann läuft alles von allein` : 'Bereitschaft'}</h2>
        {fehlend.length === 0 && <button type="button" className="text-sm underline" onClick={() => setOffen(false)}>zuklappen</button>}
      </div>
      <ul className="mt-3 space-y-2">
        {stand.punkte.map((p) => (
          <li key={p.schluessel} className="flex gap-3 text-sm">
            <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${p.ok ? 'bg-fresh text-forest' : 'bg-igred text-white'}`} aria-label={p.ok ? 'erledigt' : 'offen'}>
              {p.ok ? '✓' : '!'}
            </span>
            <span>
              <span className={p.ok ? '' : 'font-bold'}>{p.text}</span>
              {p.hilfe && <span className="block text-slate-500">{p.hilfe}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
