import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { funktion, jobAusfuehren } from '../lib/api.js'
import { euro, KAMPAGNEN_STATUS } from '../lib/format.js'
import { useAuth } from '../context/Auth.jsx'
import { Seite, Meldung, Laden, Chip, Dialog } from '../components/Teile.jsx'
import { tagesbudgetCent } from '../../shared/budget.js'
import { PartnersucheSchalter } from '../components/Partnersuche.jsx'

export default function Regionen() {
  const { istAdmin } = useAuth()
  const [daten, setDaten] = useState(null)
  const [fehler, setFehler] = useState(null)
  const [neu, setNeu] = useState(false)

  const laden = useCallback(async () => {
    const [r, k, e, c] = await Promise.all([
      supabase.from('ads_regions').select('*').order('name'),
      supabase.from('ads_campaigns').select('*'),
      supabase.from('ads_einstellungen').select('*').single(),
      supabase.from('ads_creatives').select('region_id, status, meta_ad_id, medien'),
    ])
    const f = [r, k, e, c].find((x) => x.error)
    if (f) return setFehler(f.error.message)
    setDaten({ regionen: r.data, kampagnen: k.data, einst: e.data, creatives: c.data })
  }, [])
  useEffect(() => { laden() }, [laden])

  if (fehler) return <Seite titel="Regionen"><Meldung art="fehler">{fehler}</Meldung></Seite>
  if (!daten) return <Seite titel="Regionen"><Laden /></Seite>

  const summe = daten.regionen.filter((r) => r.aktiv).reduce((a, r) => a + Number(r.monatsbudget_eur), 0)

  return (
    <Seite
      titel="Regionen und Budget"
      unter="Jede Region bekommt eine eigene Kampagne mit Umkreis um ihre Städte."
      aktion={istAdmin && <button className="knopf-haupt" onClick={() => setNeu(true)}>Neue Region</button>}
    >
      <Gesamt einst={daten.einst} summe={summe} istAdmin={istAdmin} onGespeichert={laden} />
      <div className="mt-4 space-y-4">
        {neu && <RegionFormular neu onFertig={() => { setNeu(false); laden() }} />}
        {daten.regionen.map((r) => (
          <RegionFormular
            key={r.id}
            region={r}
            kampagne={daten.kampagnen.find((k) => k.region_id === r.id)}
            bereit={daten.creatives.filter((c) => c.region_id === r.id && c.status === 'freigegeben' && !c.meta_ad_id && c.medien?.some((m) => m.typ === 'bild')).length}
            onFertig={laden}
          />
        ))}
      </div>
    </Seite>
  )
}

function Gesamt({ einst, summe, istAdmin, onGespeichert }) {
  const [wert, setWert] = useState(einst.gesamt_obergrenze_eur)
  const [link, setLink] = useState(einst.landingpage_url)
  const [schwelle, setSchwelle] = useState(einst.gute_lead_schwelle)
  const [meldung, setMeldung] = useState(null)

  async function speichern(e) {
    e.preventDefault()
    const { error } = await supabase.from('ads_einstellungen')
      .update({ gesamt_obergrenze_eur: Number(wert), landingpage_url: link, gute_lead_schwelle: Number(schwelle) }).eq('id', true)
    setMeldung(error ? { art: 'fehler', text: error.message } : { art: 'ok', text: 'Gespeichert.' })
    if (!error) onGespeichert()
  }

  return (
    <form className="karte" onSubmit={speichern}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl">Gesamt</h2>
        <p className="text-sm">Monatsbudgets zusammen: <strong>{euro(summe)}</strong> von {euro(einst.gesamt_obergrenze_eur)}</p>
      </div>
      {istAdmin ? (
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div>
            <label className="label" htmlFor="gesamt">Gesamt-Obergrenze pro Monat (€)</label>
            <input id="gesamt" className="feld" type="number" min="0" step="1" value={wert} onChange={(e) => setWert(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="schwelle">Guter Lead ab Score (%)</label>
            <input id="schwelle" className="feld" type="number" min="0" max="100" value={schwelle} onChange={(e) => setSchwelle(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="link">Erfolgscheck-Landingpage</label>
            <input id="link" className="feld" type="url" value={link} onChange={(e) => setLink(e.target.value)} />
          </div>
          <div className="md:col-span-3"><button className="knopf-haupt">Speichern</button></div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">Gesamt-Obergrenze und Landingpage legt Mark fest.</p>
      )}
      <div className="mt-3"><Meldung art={meldung?.art}>{meldung?.text}</Meldung></div>
    </form>
  )
}

function slugAus(name) {
  return name.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/^region\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function RegionFormular({ region, kampagne, bereit = 0, neu, onFertig }) {
  const { darfBedienen, istAdmin } = useAuth()
  const [f, setF] = useState(() => region || { name: '', staedte: [], umkreis_km: 25, monatsbudget_eur: 0, obergrenze_eur: 0, aktiv: true })
  const [meldung, setMeldung] = useState(null)
  const [arbeit, setArbeit] = useState(null)
  const [budgetDialog, setBudgetDialog] = useState(false)
  const setze = (k, v) => setF((alt) => ({ ...alt, [k]: v }))
  const gesperrt = !darfBedienen

  async function speichern(e) {
    e.preventDefault()
    setMeldung(null)
    const werte = {
      name: f.name.trim(), staedte: f.staedte, umkreis_km: Number(f.umkreis_km),
      monatsbudget_eur: Number(f.monatsbudget_eur), aktiv: f.aktiv,
      ...(istAdmin ? { obergrenze_eur: Number(f.obergrenze_eur) } : {}),
    }
    const { error } = neu
      ? await supabase.from('ads_regions').insert({ ...werte, slug: slugAus(f.name) })
      : await supabase.from('ads_regions').update(werte).eq('id', region.id)
    if (error) return setMeldung({ art: 'fehler', text: error.message })
    const budgetNeu = kampagne?.meta_adset_id && Number(werte.monatsbudget_eur) !== Number(region.monatsbudget_eur)
    setMeldung({ art: 'ok', text: budgetNeu
      ? (region.autopilot ? 'Gespeichert. Der Autopilot überträgt das neue Budget beim nächsten Lauf an Meta.' : 'Gespeichert. Übertrage das neue Budget noch an Meta.')
      : 'Gespeichert.' })
    onFertig()
  }

  async function anlegen() {
    setMeldung(null)
    setArbeit('Starte …')
    try {
      const r = await jobAusfuehren('kampagne_anlegen', { region_id: region.id }, setArbeit)
      setMeldung({ art: 'ok', text: r.hinweis || `${r.neu} Anzeige(n) pausiert bei Meta angelegt. Live schaltest du im Dashboard.` })
      onFertig()
    } catch (e) {
      setMeldung({ art: 'fehler', text: e.message })
    } finally {
      setArbeit(null)
    }
  }

  const status = KAMPAGNEN_STATUS[kampagne?.status || 'entwurf']
  const tbNeu = tagesbudgetCent(f.monatsbudget_eur)

  return (
    <form className="karte" onSubmit={speichern}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-2xl">{neu ? 'Neue Region' : region.name}</h2>
        {!neu && <Chip farbe={status.farbe}>{status.text}</Chip>}
      </div>
      <fieldset disabled={gesperrt} className="grid gap-3 md:grid-cols-2">
        {neu && (
          <div className="md:col-span-2">
            <label className="label" htmlFor="name-neu">Name</label>
            <input id="name-neu" className="feld" required value={f.name} onChange={(e) => setze('name', e.target.value)} />
          </div>
        )}
        <div className="md:col-span-2">
          <span className="label">Städte</span>
          <StaedteWahl staedte={f.staedte} onChange={(s) => setze('staedte', s)} />
        </div>
        <div>
          <label className="label" htmlFor={`umkreis-${region?.id || 'neu'}`}>Umkreis: {f.umkreis_km} km</label>
          <input id={`umkreis-${region?.id || 'neu'}`} type="range" min="1" max="80" className="w-full accent-forest" value={f.umkreis_km} onChange={(e) => setze('umkreis_km', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor={`budget-${region?.id || 'neu'}`}>Monatsbudget (€)</label>
            <input id={`budget-${region?.id || 'neu'}`} className="feld" type="number" min="0" step="1" value={f.monatsbudget_eur} onChange={(e) => setze('monatsbudget_eur', e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">= {euro(tbNeu / 100)} pro Tag</p>
          </div>
          <div>
            <label className="label" htmlFor={`grenze-${region?.id || 'neu'}`}>Obergrenze (€)</label>
            <input id={`grenze-${region?.id || 'neu'}`} className="feld" type="number" min="0" step="1" disabled={!istAdmin} value={f.obergrenze_eur} onChange={(e) => setze('obergrenze_eur', e.target.value)} />
            {!istAdmin && <p className="mt-1 text-xs text-slate-500">Legt Mark fest.</p>}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-forest" checked={f.aktiv} onChange={(e) => setze('aktiv', e.target.checked)} />
          Region aktiv
        </label>
      </fieldset>

      {darfBedienen && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="knopf-haupt">Speichern</button>
        </div>
      )}
      {arbeit && <div className="mt-3"><Laden text={arbeit} /></div>}
      <div className="mt-3"><Meldung art={meldung?.art}>{meldung?.text}</Meldung></div>

      {!neu && <PartnersucheSchalter region={region} kampagne={kampagne} darf={darfBedienen} onGeaendert={onFertig} />}

      {!neu && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-slate-500">Von Hand steuern (ohne Autopilot)</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="knopf-rand" onClick={anlegen} disabled={Boolean(arbeit) || bereit === 0}>
              {kampagne?.meta_campaign_id ? `${bereit} neue Anzeige(n) zu Meta` : 'Kampagne pausiert bei Meta anlegen'}
            </button>
            {kampagne?.meta_adset_id && tbNeu !== kampagne.tagesbudget_cent && Number(f.monatsbudget_eur) === Number(region.monatsbudget_eur) && (
              <button type="button" className="knopf-frisch" onClick={() => setBudgetDialog(true)}>Budget an Meta übertragen</button>
            )}
            {bereit === 0 && !kampagne?.meta_campaign_id && <span className="self-center text-xs text-slate-500">Zum Anlegen braucht es eine freigegebene Anzeige mit Bild.</span>}
          </div>
        </details>
      )}

      {!neu && (
        <BudgetDialog offen={budgetDialog} region={region} kampagne={kampagne} onFertig={(m) => { setBudgetDialog(false); if (m) { setMeldung(m); onFertig() } }} />
      )}
    </form>
  )
}

function BudgetDialog({ offen, region, kampagne, onFertig }) {
  const [ok, setOk] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState(null)
  useEffect(() => { setOk(false); setFehler(null) }, [offen])
  const neu = tagesbudgetCent(region.monatsbudget_eur)
  const alt = kampagne?.tagesbudget_cent || 0

  async function los() {
    setLaeuft(true)
    try {
      const r = await funktion('budget-uebertragen', { body: { region_id: region.id, bestaetigt: ok } })
      onFertig({ art: 'ok', text: r.geaendert ? `Tagesbudget bei Meta jetzt ${euro(r.tagesbudget_cent / 100)}.` : 'Budget war schon aktuell.' })
    } catch (e) {
      setFehler(e.message)
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <Dialog offen={offen} titel="Budget an Meta übertragen" onSchliessen={() => onFertig(null)}>
      <p className="text-sm">Tagesbudget bei Meta: <strong>{euro(alt / 100)}</strong> wird zu <strong>{euro(neu / 100)}</strong>.</p>
      <p className="mt-1 text-xs text-slate-500">Monatsbudget {euro(region.monatsbudget_eur)} geteilt durch 31 Tage. So bleibt auch der längste Monat im Rahmen.</p>
      <label className="mt-3 flex items-start gap-3 rounded-xl bg-white p-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-5 w-5 accent-forest" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>Ich gebe dieses Tagesbudget frei.</span>
      </label>
      {fehler && <div className="mt-3"><Meldung art="fehler">{fehler}</Meldung></div>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="knopf-rand" onClick={() => onFertig(null)}>Abbrechen</button>
        <button type="button" className="knopf-haupt" onClick={los} disabled={!ok || laeuft}>{laeuft ? 'Übertrage …' : 'Übertragen'}</button>
      </div>
    </Dialog>
  )
}

function StaedteWahl({ staedte, onChange }) {
  const [q, setQ] = useState('')
  const [treffer, setTreffer] = useState([])
  const [fehler, setFehler] = useState(null)

  async function suchen() {
    setFehler(null)
    try {
      const r = await funktion('ort-suchen', { methode: 'GET', query: { q } })
      setTreffer(r.treffer)
      if (!r.treffer.length) setFehler('Kein Ort gefunden.')
    } catch (e) {
      setFehler(e.message)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {staedte.map((s) => (
          <span key={s.name} className="chip bg-hell py-1 text-sm">
            {s.name}
            <button type="button" aria-label={`${s.name} entfernen`} className="ml-1 px-1 text-slate-500 hover:text-igred" onClick={() => onChange(staedte.filter((x) => x !== s))}>×</button>
          </span>
        ))}
        {staedte.length === 0 && <span className="text-sm text-slate-500">Noch keine Stadt.</span>}
      </div>
      <div className="mt-2 flex gap-2">
        <input className="feld" placeholder="Stadt suchen, z. B. Landshut" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); suchen() } }} />
        <button type="button" className="knopf-rand" onClick={suchen} disabled={q.trim().length < 2}>Suchen</button>
      </div>
      {fehler && <p className="mt-1 text-xs text-igred">{fehler}</p>}
      {treffer.length > 0 && (
        <ul className="mt-2 divide-y divide-ig-hairline rounded-xl border border-ig-hairline bg-white">
          {treffer.map((t) => (
            <li key={`${t.lat}-${t.lng}`}>
              <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-hell" onClick={() => { onChange([...staedte, { name: t.name, lat: t.lat, lng: t.lng }]); setTreffer([]); setQ('') }}>
                <strong>{t.name}</strong> <span className="text-slate-500">{t.beschreibung}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
