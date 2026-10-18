import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { Meldung } from './Teile.jsx'

const ARTEN = { store: 'Store', produkt: 'Produkt', team: 'Team', sonstiges: 'Sonstiges' }
const MAX_MB = 10

/** Echte immergrün-Fotos, die Higgsfield als Vorlage bekommt. */
export function BildVorlagen({ vorlagen, darf, onGeaendert }) {
  const [art, setArt] = useState('store')
  const [laeuft, setLaeuft] = useState(false)
  const [meldung, setMeldung] = useState(null)

  async function hochladen(e) {
    const dateien = [...(e.target.files || [])]
    e.target.value = ''
    if (!dateien.length) return
    setLaeuft(true)
    setMeldung(null)
    try {
      for (const d of dateien) {
        if (!d.type.startsWith('image/')) throw new Error(`${d.name} ist kein Bild.`)
        if (d.size > MAX_MB * 1024 * 1024) throw new Error(`${d.name} ist größer als ${MAX_MB} MB.`)
        const endung = (d.name.split('.').pop() || 'jpg').toLowerCase()
        const pfad = `referenzen/${crypto.randomUUID()}.${endung}`
        const hoch = await supabase.storage.from('ads-medien').upload(pfad, d, { contentType: d.type })
        if (hoch.error) throw new Error(hoch.error.message)
        const url = supabase.storage.from('ads-medien').getPublicUrl(pfad).data.publicUrl
        const { error } = await supabase.from('ads_referenzbilder').insert({ titel: d.name.replace(/\.[^.]+$/, ''), art, pfad, url })
        if (error) throw new Error(error.message)
      }
      setMeldung({ art: 'ok', text: `${dateien.length} Vorlage(n) gespeichert.` })
      onGeaendert()
    } catch (err) {
      setMeldung({ art: 'fehler', text: err.message })
    } finally {
      setLaeuft(false)
    }
  }

  async function aendern(v, felder) {
    const { error } = await supabase.from('ads_referenzbilder').update(felder).eq('id', v.id)
    if (error) setMeldung({ art: 'fehler', text: error.message })
    else onGeaendert()
  }

  async function loeschen(v) {
    await supabase.storage.from('ads-medien').remove([v.pfad])
    const { error } = await supabase.from('ads_referenzbilder').delete().eq('id', v.id)
    if (error) setMeldung({ art: 'fehler', text: error.message })
    else onGeaendert()
  }

  const aktiv = vorlagen.filter((v) => v.aktiv).length
  return (
    <details className="karte mt-4" open={vorlagen.length === 0}>
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl">Bildvorlagen</h2>
          <span className="text-sm text-slate-500">{aktiv} aktiv</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">Echte Fotos aus euren Stores. Higgsfield nimmt sie als Vorlage für Einrichtung, Licht und Stil.</p>
      </summary>

      {darf && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="vorlage-art">Was zeigt das Foto?</label>
            <select id="vorlage-art" className="feld w-auto" value={art} onChange={(e) => setArt(e.target.value)}>
              {Object.entries(ARTEN).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </div>
          <label className={`knopf-haupt cursor-pointer ${laeuft ? 'pointer-events-none opacity-40' : ''}`}>
            {laeuft ? 'Lade hoch …' : 'Fotos hochladen'}
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={hochladen} disabled={laeuft} />
          </label>
          <p className="w-full text-xs text-slate-500">Nur freigegebene Fotos verwenden, auf denen alle abgebildeten Personen einverstanden sind. Höchstens {MAX_MB} MB je Bild.</p>
        </div>
      )}

      {vorlagen.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {vorlagen.map((v) => (
            <li key={v.id} className={`overflow-hidden rounded-xl border border-ig-hairline bg-white ${v.aktiv ? '' : 'opacity-50'}`}>
              <img src={v.url} alt={v.titel} className="aspect-square w-full object-cover" loading="lazy" />
              <div className="space-y-1 p-2 text-xs">
                <div className="truncate font-bold" title={v.titel}>{v.titel || 'Ohne Titel'}</div>
                {darf ? (
                  <>
                    <select aria-label={`Art von ${v.titel}`} className="feld py-1 text-xs" value={v.art} onChange={(e) => aendern(v, { art: e.target.value })}>
                      {Object.entries(ARTEN).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                    </select>
                    <div className="flex justify-between gap-2">
                      <label className="flex items-center gap-1">
                        <input type="checkbox" className="h-4 w-4 accent-forest" checked={v.aktiv} onChange={(e) => aendern(v, { aktiv: e.target.checked })} /> aktiv
                      </label>
                      <button type="button" className="text-igred hover:underline" onClick={() => loeschen(v)}>Löschen</button>
                    </div>
                  </>
                ) : <div className="text-slate-500">{ARTEN[v.art]}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3"><Meldung art={meldung?.art}>{meldung?.text}</Meldung></div>
    </details>
  )
}

export function VorlagenWahl({ vorlagen, wert, onChange, id }) {
  const aktiv = vorlagen.filter((v) => v.aktiv)
  return (
    <select id={id} aria-label="Bildvorlage" className="feld w-auto py-2 text-sm" value={wert} onChange={(e) => onChange(e.target.value)}>
      <option value="auto">Vorlage: automatisch</option>
      {aktiv.map((v) => <option key={v.id} value={v.id}>Vorlage: {v.titel || ARTEN[v.art]}</option>)}
      <option value="keine">Ohne Vorlage</option>
    </select>
  )
}
