import { useCallback, useEffect, useId, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { jobAusfuehren } from '../lib/api.js'
import { useAuth } from '../context/Auth.jsx'
import { Seite, Meldung, Laden, Chip } from '../components/Teile.jsx'
import { AnzeigeVorschau, MarkenCheck, MotivChip, MedienLeiste } from '../components/Anzeige.jsx'
import { MOTIVE, CTA_TYPEN, MOTIV_SCHLUESSEL } from '../../shared/motive.js'

const STATUS_TEXT = { entwurf: 'Entwurf', freigegeben: 'Freigegeben', abgelehnt: 'Abgelehnt', archiviert: 'Archiviert' }

export default function ContentStudio() {
  const { darfBedienen } = useAuth()
  const [regionen, setRegionen] = useState([])
  const [regionId, setRegionId] = useState('')
  const [creatives, setCreatives] = useState(null)
  const [filter, setFilter] = useState('offen')

  useEffect(() => {
    supabase.from('ads_regions').select('id, name, slug, staedte, umkreis_km').eq('aktiv', true).order('name').then(({ data }) => {
      setRegionen(data || [])
      if (data?.[0]) setRegionId((alt) => alt || data[0].id)
    })
  }, [])

  const laden = useCallback(async () => {
    if (!regionId) return
    const { data } = await supabase.from('ads_creatives').select('*').eq('region_id', regionId).order('created_at', { ascending: false })
    setCreatives(data || [])
  }, [regionId])
  useEffect(() => { laden() }, [laden])

  const sichtbar = (creatives || []).filter((c) =>
    filter === 'offen' ? ['entwurf', 'abgelehnt'].includes(c.status) : filter === 'freigegeben' ? c.status === 'freigegeben' : c.status === 'archiviert')

  return (
    <Seite titel="Content-Studio" unter="Texte schreibt Claude mit dem immergrün-Wissen. Bilder und Clips kommen von Higgsfield.">
      <div className="mb-4">
        <label className="label" htmlFor="region">Region</label>
        <select id="region" className="feld md:max-w-xs" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
          {regionen.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>

      {darfBedienen && regionId && <Erzeugen regionId={regionId} onFertig={laden} />}

      <div className="mb-3 mt-6 flex gap-2" role="group" aria-label="Filter">
        {[['offen', 'In Arbeit'], ['freigegeben', 'Freigegeben'], ['archiviert', 'Archiv']].map(([k, t]) => (
          <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} className={`rounded-full px-4 py-2 text-sm font-semibold ${filter === k ? 'bg-forest text-cream' : 'border border-forest/20 bg-white'}`}>{t}</button>
        ))}
      </div>
      {!creatives ? <Laden /> : sichtbar.length === 0 ? (
        <p className="text-sm text-forest/60">Hier ist noch nichts.</p>
      ) : (
        <div className="space-y-4">{sichtbar.map((c) => <CreativeKarte key={c.id} creative={c} onGeaendert={laden} />)}</div>
      )}
    </Seite>
  )
}

function Erzeugen({ regionId, onFertig }) {
  const [motive, setMotive] = useState(MOTIV_SCHLUESSEL)
  const [anzahl, setAnzahl] = useState(1)
  const [hinweis, setHinweis] = useState('')
  const [fortschritt, setFortschritt] = useState(null)
  const [meldung, setMeldung] = useState(null)

  async function los(e) {
    e.preventDefault()
    setMeldung(null)
    setFortschritt('Claude liest das immergrün-Wissen und schreibt …')
    try {
      const r = await jobAusfuehren('texte', { region_id: regionId, motive, anzahl_je_motiv: anzahl, hinweis }, setFortschritt)
      setMeldung({ art: 'ok', text: `${r.creative_ids.length} Entwürfe erstellt. Quelle: ${r.wissen_dateien.length} Dokumente aus IG-Wissen.` })
      onFertig()
    } catch (err) {
      setMeldung({ art: 'fehler', text: err.message })
    } finally {
      setFortschritt(null)
    }
  }

  const umschalten = (m) => setMotive((alt) => (alt.includes(m) ? alt.filter((x) => x !== m) : [...alt, m]))

  return (
    <form className="karte" onSubmit={los}>
      <h2 className="mb-3 text-xl">Neue Texte erzeugen</h2>
      <fieldset>
        <legend className="label">Motive</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {MOTIV_SCHLUESSEL.map((m) => (
            <label key={m} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${motive.includes(m) ? 'border-forest bg-hell' : 'border-forest/15 bg-white'}`}>
              <input type="checkbox" className="mt-0.5 h-5 w-5 accent-forest" checked={motive.includes(m)} onChange={() => umschalten(m)} />
              <span><strong>{MOTIVE[m].titel}</strong><br /><span className="text-forest/70">{MOTIVE[m].idee}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-3 grid gap-3 sm:grid-cols-[160px_1fr]">
        <div>
          <label className="label" htmlFor="anzahl">Varianten je Motiv</label>
          <select id="anzahl" className="feld" value={anzahl} onChange={(e) => setAnzahl(Number(e.target.value))}>
            {[1, 2, 3].map((n) => <option key={n} value={n} disabled={n * motive.length > 8}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="hinweis">Wunsch (optional)</label>
          <input id="hinweis" className="feld" maxLength={500} placeholder="z. B. mehr Fokus auf Quereinsteiger" value={hinweis} onChange={(e) => setHinweis(e.target.value)} />
        </div>
      </div>
      <button className="knopf-haupt mt-4" disabled={Boolean(fortschritt) || motive.length === 0}>Texte erzeugen</button>
      {fortschritt && <Laden text={fortschritt} />}
      <div className="mt-3"><Meldung art={meldung?.art}>{meldung?.text}</Meldung></div>
    </form>
  )
}

function CreativeKarte({ creative, onGeaendert }) {
  const { darfBedienen } = useAuth()
  const [c, setC] = useState(creative)
  const [meldung, setMeldung] = useState(null)
  const [arbeit, setArbeit] = useState(null)
  const [mitClip, setMitClip] = useState(false)
  useEffect(() => setC(creative), [creative])

  const beiMeta = Boolean(creative.meta_ad_id || creative.meta_video_ad_id)
  const bearbeitbar = darfBedienen && !beiMeta && creative.status !== 'archiviert'
  const geaendert = ['hook', 'haupttext', 'ueberschrift', 'cta_typ', 'bild_idee'].some((k) => c[k] !== creative[k])
  const setze = (k, v) => setC((alt) => ({ ...alt, [k]: v }))

  async function speichern() {
    const { error } = await supabase.from('ads_creatives').update({
      hook: c.hook, haupttext: c.haupttext, ueberschrift: c.ueberschrift, cta_typ: c.cta_typ, bild_idee: c.bild_idee,
    }).eq('id', c.id)
    setMeldung(error ? { art: 'fehler', text: error.message } : { art: 'ok', text: creative.status === 'freigegeben' ? 'Gespeichert. Die Anzeige muss neu freigegeben werden.' : 'Gespeichert.' })
    if (!error) onGeaendert()
  }

  async function job(art, eingabe, start) {
    setMeldung(null)
    setArbeit(start)
    try {
      await jobAusfuehren(art, eingabe, setArbeit)
      setMeldung({ art: 'ok', text: art === 'medien' ? 'Bilder sind fertig.' : 'Neue Variante liegt oben in der Liste.' })
      onGeaendert()
    } catch (e) {
      setMeldung({ art: 'fehler', text: e.message })
    } finally {
      setArbeit(null)
    }
  }

  async function archivieren() {
    const { error } = await supabase.from('ads_creatives').update({ status: 'archiviert' }).eq('id', c.id)
    if (error) setMeldung({ art: 'fehler', text: error.message })
    else onGeaendert()
  }

  return (
    <article className="karte">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <MotivChip motiv={c.motiv} />
        <Chip farbe={creative.status === 'freigegeben' ? 'bg-fresh text-forest' : creative.status === 'abgelehnt' ? 'bg-igred/15 text-igred' : 'bg-cream text-forest border border-forest/20'}>{STATUS_TEXT[creative.status]}</Chip>
        {beiMeta && <Chip farbe="bg-forest text-cream">Bei Meta</Chip>}
      </div>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          <Feld label="Hook (erste Zeile)" wert={c.hook} onChange={(v) => setze('hook', v)} max={125} aus={!bearbeitbar} />
          <Feld label="Haupttext" wert={c.haupttext} onChange={(v) => setze('haupttext', v)} max={600} zeilen={4} aus={!bearbeitbar} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Feld label="Überschrift" wert={c.ueberschrift} onChange={(v) => setze('ueberschrift', v)} max={40} aus={!bearbeitbar} />
            <div>
              <label className="label" htmlFor={`cta-${c.id}`}>Knopf</label>
              <select id={`cta-${c.id}`} className="feld" value={c.cta_typ} disabled={!bearbeitbar} onChange={(e) => setze('cta_typ', e.target.value)}>
                {Object.entries(CTA_TYPEN).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
            </div>
          </div>
          <Feld label="Bildidee" wert={c.bild_idee} onChange={(v) => setze('bild_idee', v)} zeilen={2} aus={!bearbeitbar} />
          <MarkenCheck creative={c} />
          {c.markencheck?.quellen?.length > 0 && (
            <p className="text-xs text-forest/60">Quellen: {c.markencheck.quellen.map((q) => q.split('/').pop()).join(', ')}</p>
          )}
          <MedienLeiste medien={creative.medien} />

          {bearbeitbar && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button className="knopf-haupt" onClick={speichern} disabled={!geaendert}>Speichern</button>
              <button className="knopf-rand" disabled={Boolean(arbeit) || geaendert} onClick={() => job('medien', { creative_id: c.id, mit_clip: mitClip }, 'Higgsfield malt …')}>
                {creative.medien?.length ? 'Bilder neu erzeugen' : 'Bilder erzeugen'}
              </button>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-5 w-5 accent-forest" checked={mitClip} onChange={(e) => setMitClip(e.target.checked)} /> mit Clip 9:16
              </label>
              <button className="knopf-rand" disabled={Boolean(arbeit)} onClick={() => job('texte', { region_id: c.region_id, motive: [c.motiv], anzahl_je_motiv: 1, vorlage_creative_id: c.id }, 'Claude schreibt eine neue Variante …')}>
                Neu erzeugen
              </button>
              <button className="knopf-rand" onClick={archivieren}>Archivieren</button>
            </div>
          )}
          {beiMeta && <p className="text-xs text-forest/60">Diese Anzeige liegt bei Meta und bleibt unverändert. Für Änderungen „Neu erzeugen“ in einer neuen Variante nutzen.</p>}
          {arbeit && <Laden text={arbeit} />}
          <Meldung art={meldung?.art}>{meldung?.text}</Meldung>
        </div>
        <AnzeigeVorschau creative={{ ...c, medien: creative.medien }} />
      </div>
    </article>
  )
}

function Feld({ label, wert, onChange, max, zeilen, aus }) {
  const id = useId()
  const laenge = (wert || '').length
  return (
    <div>
      <div className="flex justify-between">
        <label className="label" htmlFor={id}>{label}</label>
        {max && <span className={`text-xs ${laenge > max ? 'text-igred' : 'text-forest/50'}`}>{laenge}/{max}</span>}
      </div>
      {zeilen ? (
        <textarea id={id} className="feld" rows={zeilen} value={wert || ''} disabled={aus} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input id={id} className="feld" value={wert || ''} disabled={aus} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  )
}
