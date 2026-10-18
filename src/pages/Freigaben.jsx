import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { datumZeit } from '../lib/format.js'
import { useAuth } from '../context/Auth.jsx'
import { Seite, Meldung, Laden } from '../components/Teile.jsx'
import { AnzeigeVorschau, MarkenCheck, MotivChip } from '../components/Anzeige.jsx'
import { pruefeCreative } from '../../shared/markenregeln.js'

const ART_TEXT = {
  creative: 'Anzeige', kampagne_live: 'Live geschaltet', kampagne_pause: 'Pausiert', budget: 'Budget', obergrenze: 'Obergrenze',
}

function warumNichtBereit(c) {
  const g = [...pruefeCreative(c).verstoesse]
  if (!c.medien?.some((m) => m.typ === 'bild')) g.push('Bild fehlt')
  return g
}

export default function Freigaben() {
  const { darfBedienen } = useAuth()
  const [daten, setDaten] = useState(null)

  const laden = useCallback(async () => {
    const [c, r, a, u] = await Promise.all([
      supabase.from('ads_creatives').select('*').eq('status', 'entwurf').order('created_at'),
      supabase.from('ads_regions').select('id, name'),
      supabase.from('ads_approvals').select('*').order('created_at', { ascending: false }).limit(30),
      supabase.from('ads_users').select('id, email, name'),
    ])
    setDaten({ creatives: c.data || [], regionen: r.data || [], verlauf: a.data || [], nutzer: u.data || [] })
  }, [])
  useEffect(() => { laden() }, [laden])

  if (!daten) return <Seite titel="Freigaben"><Laden /></Seite>
  const bereit = daten.creatives.filter((c) => warumNichtBereit(c).length === 0)
  const offen = daten.creatives.filter((c) => warumNichtBereit(c).length > 0)
  const regionName = (id) => daten.regionen.find((r) => r.id === id)?.name || ''
  const wer = (id) => { const n = daten.nutzer.find((x) => x.id === id); return n?.name || n?.email || 'App' }

  return (
    <Seite titel="Freigaben" unter="Nichts geht zu Meta, bevor ein Mensch es freigibt.">
      <h2 className="mb-3 text-xl">Bereit zur Freigabe ({bereit.length})</h2>
      {bereit.length === 0 && <p className="text-sm text-slate-500">Gerade wartet nichts auf dich.</p>}
      <div className="space-y-4">
        {bereit.map((c) => <FreigabeKarte key={c.id} creative={c} region={regionName(c.region_id)} darf={darfBedienen} onFertig={laden} />)}
      </div>

      {offen.length > 0 && (
        <div className="karte mt-6">
          <h2 className="mb-2 text-xl">Noch nicht bereit ({offen.length})</h2>
          <ul className="space-y-2 text-sm">
            {offen.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <MotivChip motiv={c.motiv} /> <span>{regionName(c.region_id)}: {c.hook || 'ohne Hook'}</span>
                <span className="text-igred">{warumNichtBereit(c).join(', ')}</span>
              </li>
            ))}
          </ul>
          <Link to="/studio" className="knopf-rand mt-3">Im Studio bearbeiten</Link>
        </div>
      )}

      <div className="karte mt-6">
        <h2 className="mb-2 text-xl">Verlauf</h2>
        {daten.verlauf.length === 0 ? <p className="text-sm text-slate-500">Noch keine Entscheidungen.</p> : (
          <ul className="divide-y divide-ig-hairline text-sm">
            {daten.verlauf.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span><strong>{ART_TEXT[a.art]}</strong> {a.entscheidung === 'abgelehnt' ? 'abgelehnt' : ''} {a.kommentar && <span className="text-slate-500">„{a.kommentar}“</span>}</span>
                <span className="text-slate-500">{wer(a.user_id)} · {datumZeit(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Seite>
  )
}

function FreigabeKarte({ creative, region, darf, onFertig }) {
  const [kommentar, setKommentar] = useState('')
  const [fehler, setFehler] = useState(null)
  const [laeuft, setLaeuft] = useState(false)

  async function entscheiden(entscheidung) {
    setLaeuft(true); setFehler(null)
    const { error } = await supabase.rpc('ads_creative_entscheiden', { p_creative_id: creative.id, p_entscheidung: entscheidung, p_kommentar: kommentar || null })
    setLaeuft(false)
    if (error) setFehler(error.message)
    else onFertig()
  }

  return (
    <article className="karte grid gap-4 md:grid-cols-[340px_1fr]">
      <AnzeigeVorschau creative={creative} />
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2"><MotivChip motiv={creative.motiv} /><span className="text-sm font-semibold">{region}</span></div>
        <MarkenCheck creative={creative} />
        <p className="text-xs text-slate-500">Bilder: {creative.medien.map((m) => `${m.typ === 'video' ? 'Clip' : 'Bild'} ${m.format}`).join(', ')}</p>
        {darf ? (
          <>
            <label className="label" htmlFor={`k-${creative.id}`}>Notiz (optional)</label>
            <input id={`k-${creative.id}`} className="feld" value={kommentar} onChange={(e) => setKommentar(e.target.value)} />
            <div className="flex gap-2">
              <button className="knopf-haupt flex-1" disabled={laeuft} onClick={() => entscheiden('freigegeben')}>Freigeben</button>
              <button className="knopf-rand flex-1" disabled={laeuft} onClick={() => entscheiden('abgelehnt')}>Ablehnen</button>
            </div>
            <p className="text-xs text-slate-500">Freigegeben heißt noch nicht live. Danach legst du die Anzeige unter Regionen pausiert bei Meta an.</p>
          </>
        ) : <p className="text-sm text-slate-500">Freigeben dürfen Admin und Expansion.</p>}
        <Meldung art="fehler">{fehler}</Meldung>
      </div>
    </article>
  )
}
