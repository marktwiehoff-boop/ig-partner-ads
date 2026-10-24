import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { funktion } from '../lib/api.js'
import { euro } from '../lib/format.js'
import { Dialog, Meldung, Chip } from './Teile.jsx'
import { tagesbudgetCent } from '../../shared/budget.js'
import { MOTIVE, MOTIV_SCHLUESSEL } from '../../shared/motive.js'

/**
 * Der eine Schalter, der zählt: Partnersuche starten heißt, die App erzeugt
 * Texte, prüft sie, macht Bilder, gibt frei, legt die Kampagne an und schaltet
 * live. Alles im Rahmen des Monatsbudgets. Stoppen pausiert die Kampagne.
 */
export function PartnersucheSchalter({ region, kampagne, darf, onGeaendert }) {
  const [dialog, setDialog] = useState(null) // 'start' | 'stopp'
  const [meldung, setMeldung] = useState(null)
  const [laeuft, setLaeuft] = useState(false)

  async function modus(e) {
    const { error } = await supabase.from('ads_regions').update({ freigabe_modus: e.target.value }).eq('id', region.id)
    if (error) setMeldung({ art: 'fehler', text: error.message })
    else onGeaendert()
  }

  async function starten() {
    setLaeuft(true)
    setMeldung(null)
    const { error } = await supabase.from('ads_regions').update({ autopilot: true }).eq('id', region.id)
    if (error) {
      setMeldung({ art: 'fehler', text: error.message })
    } else {
      try { await funktion('autopilot-anstossen') } catch { /* der Zeitplan holt das in 15 Minuten nach */ }
      setMeldung({ art: 'ok', text: 'Partnersuche gestartet. Die App legt jetzt los, der erste Durchlauf dauert einige Minuten.' })
      onGeaendert()
    }
    setLaeuft(false)
    setDialog(null)
  }

  async function stoppen() {
    setLaeuft(true)
    setMeldung(null)
    const { error } = await supabase.from('ads_regions').update({ autopilot: false }).eq('id', region.id)
    if (error) {
      setMeldung({ art: 'fehler', text: error.message })
    } else {
      if (kampagne?.meta_campaign_id && kampagne.status === 'live') {
        try { await funktion('kampagne-schalten', { body: { region_id: region.id, aktion: 'pause', kommentar: 'Partnersuche gestoppt' } }) }
        catch (e) { setMeldung({ art: 'fehler', text: `Gestoppt, aber die Kampagne bei Meta ließ sich nicht pausieren: ${e.message}` }) }
      }
      setMeldung((m) => m || { art: 'ok', text: 'Partnersuche gestoppt. Die Kampagne ist pausiert.' })
      onGeaendert()
    }
    setLaeuft(false)
    setDialog(null)
  }

  const tb = tagesbudgetCent(region.monatsbudget_eur)
  return (
    <div className="mt-4 rounded-2xl border border-ig-hairline bg-ig-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-xl">Partnersuche</h3>
            {region.autopilot
              ? <Chip farbe="bg-fresh text-forest">läuft automatisch</Chip>
              : <Chip farbe="bg-white text-ig-800 border border-ig-hairline">aus</Chip>}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {region.autopilot
              ? 'Texte, Prüfung, Bilder, Freigabe, Kampagne und Live-Schaltung macht die App selbst, im Rahmen des Monatsbudgets.'
              : 'Ein Klick, und die App erzeugt Anzeigen, prüft sie, legt die Kampagne an und schaltet sie live.'}
          </p>
        </div>
        {darf && (
          region.autopilot
            ? <button type="button" className="knopf-warn" onClick={() => setDialog('stopp')}>Partnersuche stoppen</button>
            : <button type="button" className="knopf-frisch" onClick={() => setDialog('start')} disabled={!region.aktiv}>Partnersuche starten</button>
        )}
      </div>
      {darf && (
        <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-bold">Freigabe der Anzeigen:</span>
          <select className="feld w-auto py-1.5 text-sm" value={region.freigabe_modus || 'automatisch'} onChange={modus}>
            <option value="automatisch">automatisch nach bestandener Prüfung</option>
            <option value="manuell">erst nach meinem Klick unter Freigaben</option>
          </select>
        </label>
      )}
      <div className="mt-3"><Meldung art={meldung?.art}>{meldung?.text}</Meldung></div>

      <Dialog offen={dialog === 'start'} titel={`Partnersuche in ${region.name} starten`} onSchliessen={() => setDialog(null)}>
        <p className="text-sm">Das ist deine Freigabe. Ab jetzt gibt Meta Geld aus, sobald die erste Anzeige fertig ist.</p>
        <dl className="my-3 grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl bg-white p-3 text-sm">
          <dt>Monatsbudget</dt><dd className="text-right font-bold">{euro(region.monatsbudget_eur)}</dd>
          <dt>Tagesbudget bei Meta</dt><dd className="text-right font-bold">{euro(tb / 100)}</dd>
          <dt>Obergrenze (hart)</dt><dd className="text-right font-bold">{euro(region.obergrenze_eur)}</dd>
          <dt>Umkreis</dt><dd className="text-right font-bold">{(region.staedte || []).map((s) => s.name).join(', ')} · {region.umkreis_km} km</dd>
        </dl>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Vier Motive, Texte aus dem IG-Wissen, Bilder mit euren Vorlagen.</li>
          <li>Jede Anzeige wird vor der Freigabe von einem zweiten Claude-Durchlauf geprüft. Fällt sie zweimal durch, wartet das Motiv auf dich.</li>
          <li>Kampagne bei Meta, Tagesbudget {euro(tb / 100)}, dann live. Nähert sich die Region der Obergrenze, pausiert die App selbst und macht im neuen Monat weiter.</li>
          <li>Mehr Budget gibt es nur, wenn du das Monatsbudget änderst.</li>
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="knopf-rand" onClick={() => setDialog(null)}>Abbrechen</button>
          <button type="button" className="knopf-haupt" onClick={starten} disabled={laeuft}>{laeuft ? 'Starte …' : 'Ja, Partnersuche starten'}</button>
        </div>
      </Dialog>

      <Dialog offen={dialog === 'stopp'} titel={`Partnersuche in ${region.name} stoppen`} onSchliessen={() => setDialog(null)}>
        <p className="text-sm">Die Kampagne wird pausiert, es wird kein Geld mehr ausgegeben. Anzeigen und Bilder bleiben erhalten. Du kannst jederzeit wieder starten.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="knopf-rand" onClick={() => setDialog(null)}>Abbrechen</button>
          <button type="button" className="knopf-warn" onClick={stoppen} disabled={laeuft}>{laeuft ? 'Stoppe …' : 'Jetzt stoppen'}</button>
        </div>
      </Dialog>
    </div>
  )
}

/** Fortschritt der Pipeline je Region, berechnet aus den Anzeigen. */
export function Fortschritt({ region, kampagne, creatives }) {
  const offen = creatives.filter((c) => !['archiviert', 'abgelehnt'].includes(c.status))
  const motive = MOTIV_SCHLUESSEL.map((m) => {
    const c = offen.filter((x) => x.motiv === m)
    const live = c.some((x) => x.meta_aktiv)
    const beiMeta = c.some((x) => x.meta_ad_id)
    const frei = c.some((x) => x.status === 'freigegeben')
    const bild = c.some((x) => (x.medien || []).some((mm) => mm.typ === 'bild'))
    const geprueft = c.some((x) => x.markencheck?.pruefung?.bestanden)
    const stufe = live ? 5 : beiMeta ? 4 : frei ? 3 : bild ? 2 : geprueft ? 1.5 : c.length ? 1 : 0
    const text = live ? 'live' : beiMeta ? 'bei Meta' : frei ? 'freigegeben' : bild ? 'Bild da' : geprueft ? 'geprüft' : c.length ? 'Text da' : 'offen'
    return { m, stufe, text }
  })
  const wartetAufMensch = region.freigabe_modus === 'manuell' && offen.some((c) => c.status === 'entwurf' && c.markencheck?.pruefung?.bestanden && (c.medien || []).some((mm) => mm.typ === 'bild'))
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-bold">Anzeigen je Motiv</span>
        {region.autopilot && <span className="text-slate-500">{kampagne?.status === 'live' ? 'Kampagne live' : 'wird vorbereitet'}</span>}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {motive.map(({ m, stufe, text }) => (
          <div key={m} className="rounded-lg bg-white px-2 py-1.5 text-[11px]" title={MOTIVE[m].titel}>
            <div className="truncate font-bold">{MOTIVE[m].titel}</div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ig-100"><div className={`h-full ${stufe >= 5 ? 'bg-fresh' : 'bg-ig-600'}`} style={{ width: `${(stufe / 5) * 100}%` }} /></div>
            <div className="mt-0.5 text-slate-500">{text}</div>
          </div>
        ))}
      </div>
      {wartetAufMensch && <p className="mt-2 text-xs font-bold text-ig-700">Anzeigen warten unter „Freigaben“ auf deinen Klick.</p>}
    </div>
  )
}

export function AutopilotStatus() {
  const [lauf, setLauf] = useState(null)
  useEffect(() => {
    supabase.from('ads_autopilot_lauf').select('*').eq('id', true).maybeSingle().then(({ data }) => setLauf(data))
  }, [])
  if (!lauf?.letzter_lauf) return null
  const vor = Math.round((Date.now() - new Date(lauf.letzter_lauf).getTime()) / 60000)
  const regionen = Object.values(lauf.letzter_bericht?.regionen || {})
  const hinweise = regionen.flatMap((r) => (r.hinweise || []).map((h) => `${r.name}: ${h}`)).slice(0, 3)
  return (
    <span className="text-xs text-slate-500">
      Autopilot zuletzt vor {vor} Min.{lauf.laeuft_seit ? ', läuft gerade' : ''}
      {lauf.letzter_bericht?.fehler && <span className="block font-bold text-igred">Letzter Lauf mit Fehler: {lauf.letzter_bericht.fehler}</span>}
      {hinweise.map((h) => <span key={h} className="block text-ig-700">{h}</span>)}
    </span>
  )
}
