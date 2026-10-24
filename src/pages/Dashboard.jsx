import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { funktion } from '../lib/api.js'
import { euro, anzahl, datumZeit, zeitraum, KAMPAGNEN_STATUS } from '../lib/format.js'
import { useAuth } from '../context/Auth.jsx'
import { Seite, Meldung, Laden, Chip, Dialog, Balken } from '../components/Teile.jsx'
import { MOTIVE } from '../../shared/motive.js'
import { tagesbudgetCent } from '../../shared/budget.js'
import { Fortschritt, AutopilotStatus } from '../components/Partnersuche.jsx'
import { Bereitschaft } from '../components/Bereitschaft.jsx'

const ZEITRAEUME = [['monat', 'Dieser Monat'], ['30', '30 Tage'], ['7', '7 Tage']]

export default function Dashboard() {
  const { darfBedienen } = useAuth()
  const [art, setArt] = useState('monat')
  const [daten, setDaten] = useState(null)
  const [fehler, setFehler] = useState(null)
  const [meldung, setMeldung] = useState(null)
  const [holt, setHolt] = useState(false)
  const [stosse, setStosse] = useState(false)
  const [schalten, setSchalten] = useState(null)

  const laden = useCallback(async () => {
    setFehler(null)
    const { von, bis } = zeitraum(art)
    const monat = zeitraum('monat')
    const [dash, regionen, kampagnen, ausgaben, einst, protokoll, anzeigen] = await Promise.all([
      supabase.rpc('ads_dashboard', { p_von: von, p_bis: bis }),
      supabase.from('ads_regions').select('*').order('name'),
      supabase.from('ads_campaigns').select('*'),
      supabase.rpc('ads_ausgaben_monat', { p_stichtag: monat.bis }),
      supabase.from('ads_einstellungen').select('*').single(),
      supabase.from('ads_protokoll').select('*').order('created_at', { ascending: false }).limit(12),
      supabase.from('ads_creatives').select('id, region_id, motiv, status, meta_ad_id, meta_aktiv, medien, markencheck'),
    ])
    const f = [dash, regionen, kampagnen, ausgaben, einst, protokoll, anzeigen].find((r) => r.error)
    if (f) return setFehler(f.error.message)
    setDaten({
      zeilen: dash.data, regionen: regionen.data, kampagnen: kampagnen.data, einst: einst.data,
      ausgabenMonat: Object.fromEntries(ausgaben.data.map((a) => [a.region_id, Number(a.ausgaben_eur)])),
      protokoll: protokoll.data, anzeigen: anzeigen.data,
    })
  }, [art])

  useEffect(() => { laden() }, [laden])

  const summe = useMemo(() => {
    const s = { ausgaben: 0, leads: 0, gute: 0, leadsMeta: 0 }
    for (const z of daten?.zeilen || []) {
      s.ausgaben += Number(z.ausgaben_eur); s.leads += Number(z.leads); s.gute += Number(z.gute_leads); s.leadsMeta += Number(z.leads_meta)
    }
    return s
  }, [daten])

  async function autopilotAnstossen() {
    setStosse(true); setMeldung(null)
    try {
      await funktion('autopilot-anstossen')
      setMeldung({ art: 'ok', text: 'Der Autopilot läuft jetzt im Hintergrund. In ein paar Minuten siehst du hier die Schritte.' })
    } catch (e) {
      setMeldung({ art: 'fehler', text: e.message })
    } finally {
      setStosse(false)
    }
  }

  async function zahlenHolen() {
    setHolt(true); setMeldung(null)
    try {
      const r = await funktion('kennzahlen-abholen')
      setMeldung({ art: 'ok', text: `${r.zeilen} Zeilen von Meta abgeholt.${r.pausiert.length ? ` Schutzpause: ${r.pausiert.map((p) => p.region).join(', ')}` : ''}` })
      await laden()
    } catch (e) {
      setMeldung({ art: 'fehler', text: e.message })
    } finally {
      setHolt(false)
    }
  }

  if (fehler) return <Seite titel="Dashboard"><Meldung art="fehler">{fehler}</Meldung></Seite>
  if (!daten) return <Seite titel="Dashboard"><Laden /></Seite>

  const ausgabenGesamtMonat = Object.values(daten.ausgabenMonat).reduce((a, b) => a + b, 0)

  return (
    <Seite
      titel="Dashboard"
      unter="Was die Anzeigen kosten und wie gut die Leads sind."
      aktion={darfBedienen && (
        <div className="flex flex-wrap items-center gap-2">
          <AutopilotStatus />
          <button className="knopf-rand" onClick={autopilotAnstossen} disabled={stosse}>{stosse ? 'Gestartet …' : 'Autopilot jetzt laufen lassen'}</button>
          <button className="knopf-rand" onClick={zahlenHolen} disabled={holt}>{holt ? 'Hole Zahlen …' : 'Zahlen jetzt abholen'}</button>
        </div>
      )}
    >
      <div className="mb-4 flex gap-2" role="group" aria-label="Zeitraum">
        {ZEITRAEUME.map(([k, t]) => (
          <button key={k} onClick={() => setArt(k)} aria-pressed={art === k} className={`rounded-full px-4 py-2 text-sm font-semibold ${art === k ? 'bg-forest text-white' : 'bg-white text-forest border border-ig-hairline'}`}>{t}</button>
        ))}
      </div>
      <Bereitschaft />
      <div className="mb-4"><Meldung art={meldung?.art}>{meldung?.text}</Meldung></div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kachel titel="Ausgaben" wert={euro(summe.ausgaben)} unter={`Monat: ${euro(ausgabenGesamtMonat)} von ${euro(daten.einst.gesamt_obergrenze_eur)}`} />
        <Kachel titel="Leads" wert={anzahl(summe.leads)} unter={`Meta meldet ${anzahl(summe.leadsMeta)}`} />
        <Kachel titel="Gute Leads" wert={anzahl(summe.gute)} unter={`Score ab ${daten.einst.gute_lead_schwelle} %`} />
        <Kachel titel="Kosten pro gutem Lead" wert={summe.gute ? euro(summe.ausgaben / summe.gute) : '–'} hervor />
      </div>

      <div className="space-y-4">
        {daten.regionen.map((r) => (
          <RegionKarte
            key={r.id}
            region={r}
            kampagne={daten.kampagnen.find((k) => k.region_id === r.id)}
            zeilen={daten.zeilen.filter((z) => z.region_id === r.id)}
            ausgabenMonat={daten.ausgabenMonat[r.id] || 0}
            anzeigenBeiMeta={daten.anzeigen.filter((a) => a.region_id === r.id && a.meta_ad_id && a.status === 'freigegeben').length}
            creatives={daten.anzeigen.filter((a) => a.region_id === r.id)}
            darfBedienen={darfBedienen}
            onSchalten={(aktion) => setSchalten({ region: r, aktion })}
          />
        ))}
      </div>

      {daten.protokoll.length > 0 && (
        <div className="karte mt-6">
          <h2 className="mb-2 text-xl">Was die App zuletzt selbst getan hat</h2>
          <ul className="space-y-1 text-sm">
            {daten.protokoll.map((p) => (
              <li key={p.id}>
                <span className="text-slate-500">{datumZeit(p.created_at)}</span>{' '}
                <ProtokollText p={p} regionen={daten.regionen} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <SchaltDialog auftrag={schalten} kampagnen={daten.kampagnen} ausgaben={daten.ausgabenMonat} onFertig={(m) => { setSchalten(null); if (m) { setMeldung(m); laden() } }} />
    </Seite>
  )
}

const SCHRITT_TEXT = {
  texte: (d) => `Texte erzeugt für ${(d.motive || []).map((m) => MOTIVE[m]?.titel || m).join(', ')}`,
  pruefen: (d) => `Prüfung ${MOTIVE[d.motiv]?.titel || ''}: ${d.bestanden ? 'bestanden' : `abgelehnt (${d.befunde})`}`,
  bilder: (d) => `${d.anzahl} Bilder erzeugt${d.mit_vorlage ? ' mit Vorlage' : ''}`,
  freigeben: (d) => `Anzeige ${MOTIVE[d.motiv]?.titel || ''} automatisch freigegeben`,
  meta_anlegen: (d) => `${d.neu} Anzeige(n) pausiert bei Meta angelegt`,
  budget: (d) => `Tagesbudget an Meta: ${euro((d.tagesbudget_cent || 0) / 100)}`,
  live: (d) => d.gesperrt ? `Nicht live: ${d.gesperrt.join(', ')}` : `Live geschaltet (${d.anzeigen} Anzeige(n))`,
  optimierung: (d) => `Motiv ${MOTIVE[d.motiv]?.titel || d.motiv} pausiert: ${d.grund}`,
  hinweis: (d) => d.text,
}

function ProtokollText({ p, regionen }) {
  const region = regionen.find((r) => r.id === p.region_id)?.name
  const d = p.details || {}
  if (p.ereignis === 'schutzpause') return <>Schutzpause{region ? ` ${region}` : ''}: {d.grund}</>
  if (p.ereignis === 'kennzahlen_abgeholt') return <>Kennzahlen abgeholt ({d.zeilen} Zeilen)</>
  if (p.ereignis === 'lead_meldung_fehler') return <>Lead gespeichert, Meldung an Meta fehlgeschlagen: {d.fehler}</>
  if (p.ereignis === 'autopilot') {
    const text = d.fehler ? `${d.schritt}: Fehler, ${d.fehler}` : (SCHRITT_TEXT[d.schritt] || (() => d.schritt))(d)
    return <><strong>{region}</strong> · Autopilot: {text}</>
  }
  return <>{p.ereignis}</>
}

function Kachel({ titel, wert, unter, hervor }) {
  return (
    <div className={`rounded-2xl p-4 ${hervor ? 'bg-forest text-white' : 'bg-white border border-ig-hairline'}`}>
      <div className={`text-xs font-semibold uppercase tracking-wide ${hervor ? 'text-fresh' : 'text-slate-500'}`}>{titel}</div>
      <div className="mt-1 font-display text-2xl">{wert}</div>
      {unter && <div className={`mt-1 text-xs ${hervor ? 'text-white/70' : 'text-slate-500'}`}>{unter}</div>}
    </div>
  )
}

function RegionKarte({ region, kampagne, zeilen, ausgabenMonat, anzeigenBeiMeta, creatives, darfBedienen, onSchalten }) {
  const status = KAMPAGNEN_STATUS[kampagne?.status || 'entwurf']
  return (
    <section className="karte">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl">{region.name}</h2>
          <p className="text-xs text-slate-500">{(region.staedte || []).map((s) => s.name).join(', ')} · {region.umkreis_km} km Umkreis</p>
        </div>
        <div className="flex gap-2">
          {region.autopilot && <Chip farbe="bg-fresh text-forest">Partnersuche läuft</Chip>}
          <Chip farbe={status.farbe}>{status.text}</Chip>
        </div>
      </div>

      <Fortschritt region={region} kampagne={kampagne} creatives={creatives} />

      <div className="mt-3">
        <div className="mb-1 flex justify-between text-xs">
          <span>Ausgaben im Monat: <strong>{euro(ausgabenMonat)}</strong> von {euro(region.monatsbudget_eur)}</span>
          <span className="text-slate-500">Obergrenze {euro(region.obergrenze_eur)}</span>
        </div>
        <Balken wert={ausgabenMonat} max={Number(region.obergrenze_eur)} grenze={Number(region.monatsbudget_eur)} />
      </div>
      {kampagne?.letzter_fehler && <div className="mt-3"><Meldung art={kampagne.status === 'fehler' ? 'fehler' : 'info'}>{kampagne.letzter_fehler}</Meldung></div>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 pr-2 font-semibold">Motiv</th>
              <th className="py-1 pr-2 text-right font-semibold">Ausgaben</th>
              <th className="py-1 pr-2 text-right font-semibold">Leads</th>
              <th className="py-1 pr-2 text-right font-semibold">Gute Leads</th>
              <th className="py-1 pr-2 text-right font-semibold">€ / guter Lead</th>
              <th className="py-1 text-right font-semibold">Termine</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.length === 0 && <tr><td colSpan={6} className="py-3 text-slate-500">Noch keine Zahlen im Zeitraum.</td></tr>}
            {zeilen.map((z) => (
              <tr key={z.motiv || 'ohne'} className="border-t border-ig-hairline">
                <td className="py-2 pr-2">{MOTIVE[z.motiv]?.titel || 'Ohne Zuordnung'}</td>
                <td className="py-2 pr-2 text-right">{euro(z.ausgaben_eur)}</td>
                <td className="py-2 pr-2 text-right">{anzahl(z.leads)} <span className="text-slate-500">({anzahl(z.leads_meta)})</span></td>
                <td className="py-2 pr-2 text-right">{anzahl(z.gute_leads)}</td>
                <td className="py-2 pr-2 text-right font-semibold">{euro(z.kosten_pro_gutem_lead)}</td>
                <td className="py-2 text-right text-slate-500" title="Kommt mit der CRM-Anbindung in Phase 4">–</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[11px] text-slate-500">Leads aus dem Erfolgscheck, in Klammern die Zählung von Meta.</p>
      </div>

      {darfBedienen && kampagne?.meta_campaign_id && !region.autopilot && (
        <div className="mt-4 flex flex-wrap gap-2">
          {kampagne.status !== 'live' && <button className="knopf-frisch" onClick={() => onSchalten('live')} disabled={!anzeigenBeiMeta}>Live schalten</button>}
          {kampagne.status === 'live' && <button className="knopf-rand" onClick={() => onSchalten('live')}>Neue Anzeigen live schalten</button>}
          {kampagne.status === 'live' && <button className="knopf-warn" onClick={() => onSchalten('pause')}>Pausieren</button>}
          <span className="self-center text-xs text-slate-500">{anzeigenBeiMeta} freigegebene Anzeige(n) bei Meta · Tagesbudget {euro((kampagne.tagesbudget_cent || 0) / 100)}</span>
        </div>
      )}
    </section>
  )
}

function SchaltDialog({ auftrag, kampagnen, ausgaben, onFertig }) {
  const [ok, setOk] = useState(false)
  const [kommentar, setKommentar] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [antwort, setAntwort] = useState(null)

  useEffect(() => { setOk(false); setKommentar(''); setAntwort(null) }, [auftrag])
  if (!auftrag) return <Dialog offen={false} />

  const { region, aktion } = auftrag
  const k = kampagnen.find((x) => x.region_id === region.id)
  const live = aktion === 'live'

  async function los() {
    setLaeuft(true)
    try {
      const r = await funktion('kampagne-schalten', { body: { region_id: region.id, aktion, bestaetigt: ok, kommentar } })
      if (r.gesperrt) setAntwort({ art: 'fehler', liste: r.gesperrt })
      else onFertig({ art: 'ok', text: live ? `${region.name} ist live.` : `${region.name} ist pausiert.` })
    } catch (e) {
      setAntwort({ art: 'fehler', liste: [e.message] })
    } finally {
      setLaeuft(false)
    }
  }

  return (
    <Dialog offen titel={live ? `${region.name} live schalten` : `${region.name} pausieren`} onSchliessen={() => onFertig(null)}>
      {live ? (
        <>
          <p className="text-sm">Ab dann gibt Meta echtes Geld aus. Prüfe die Werte:</p>
          <dl className="my-3 grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl bg-white p-3 text-sm">
            <dt>Tagesbudget</dt><dd className="text-right font-semibold">{euro(tagesbudgetCent(region.monatsbudget_eur) / 100)}</dd>
            <dt>Monatsbudget</dt><dd className="text-right font-semibold">{euro(region.monatsbudget_eur)}</dd>
            <dt>Obergrenze</dt><dd className="text-right font-semibold">{euro(region.obergrenze_eur)}</dd>
            <dt>Schon ausgegeben</dt><dd className="text-right font-semibold">{euro(ausgaben[region.id] || 0)}</dd>
            <dt>Bei Meta hinterlegt</dt><dd className="text-right font-semibold">{euro((k?.tagesbudget_cent || 0) / 100)} pro Tag</dd>
          </dl>
          <label className="flex items-start gap-3 rounded-xl bg-white p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-forest" checked={ok} onChange={(e) => setOk(e.target.checked)} />
            <span>Ich gebe die Kampagne mit diesem Budget frei. Die App prüft vor dem Schalten noch einmal alle Grenzen.</span>
          </label>
        </>
      ) : (
        <p className="text-sm">Die Kampagne stoppt sofort. Wieder live geht sie nur mit neuer Freigabe.</p>
      )}
      <label className="label mt-3" htmlFor="kommentar">Notiz (optional)</label>
      <input id="kommentar" className="feld" value={kommentar} onChange={(e) => setKommentar(e.target.value)} />
      {antwort && (
        <div className="mt-3"><Meldung art="fehler"><p className="font-semibold">Nicht geschaltet:</p><ul className="ml-4 list-disc">{antwort.liste.map((g) => <li key={g}>{g}</li>)}</ul></Meldung></div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button className="knopf-rand" onClick={() => onFertig(null)}>Abbrechen</button>
        <button className={live ? 'knopf-haupt' : 'knopf-warn'} onClick={los} disabled={laeuft || (live && !ok)}>
          {laeuft ? 'Schalte …' : live ? 'Jetzt live schalten' : 'Jetzt pausieren'}
        </button>
      </div>
    </Dialog>
  )
}
