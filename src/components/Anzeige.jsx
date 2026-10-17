import { CTA_TYPEN, MOTIVE } from '../../shared/motive.js'
import { pruefeCreative } from '../../shared/markenregeln.js'
import { waehleBild } from '../../shared/meta-payload.js'
import { Chip } from './Teile.jsx'

/** Vorschau so, wie die Anzeige im Facebook- oder Instagram-Feed aussieht. */
export function AnzeigeVorschau({ creative, domain = 'erfolgscheck' }) {
  const bild = waehleBild(creative.medien)
  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-forest/15 bg-white text-[15px] text-neutral-900 shadow-sm">
      <div className="flex items-center gap-2 p-3">
        <img src="/favicon.svg" alt="" className="h-9 w-9 rounded-full" />
        <div className="leading-tight">
          <div className="font-semibold">immergrün</div>
          <div className="text-xs text-neutral-500">Gesponsert</div>
        </div>
      </div>
      <div className="whitespace-pre-line px-3 pb-3">
        {creative.hook && <p className="font-semibold">{creative.hook}</p>}
        {creative.haupttext && <p className="mt-1">{creative.haupttext}</p>}
      </div>
      <div className="aspect-[4/5] w-full bg-hell">
        {bild ? (
          <img src={bild.url} alt={creative.bild_idee || 'Anzeigenbild'} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-forest/60">
            Noch kein Bild.<br />{creative.bild_idee}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 bg-neutral-100 p-3">
        <div className="min-w-0">
          <div className="text-xs uppercase text-neutral-500">{domain}</div>
          <div className="truncate font-semibold">{creative.ueberschrift || 'Überschrift'}</div>
        </div>
        <span className="shrink-0 rounded-md bg-neutral-200 px-3 py-2 text-sm font-semibold">{CTA_TYPEN[creative.cta_typ] || 'Mehr dazu'}</span>
      </div>
    </div>
  )
}

/** Markenprüfung live im Browser. Die Datenbank prüft beim Freigeben noch einmal. */
export function MarkenCheck({ creative }) {
  const { verstoesse, hinweise } = pruefeCreative(creative)
  if (verstoesse.length === 0 && hinweise.length === 0) {
    return <Chip farbe="bg-fresh/30 text-forest">Markenregeln eingehalten</Chip>
  }
  return (
    <div className="space-y-1">
      {verstoesse.map((v) => <div key={v}><Chip farbe="bg-igred text-white">{v}</Chip></div>)}
      {hinweise.map((h) => <p key={h} className="text-xs text-forest/70">{h}</p>)}
    </div>
  )
}

export function MotivChip({ motiv }) {
  return <Chip>{MOTIVE[motiv]?.titel || motiv}</Chip>
}

export function MedienLeiste({ medien }) {
  if (!medien?.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {medien.map((m) => (
        <a key={`${m.typ}-${m.format}`} href={m.url} target="_blank" rel="noreferrer" className="block text-center text-[11px] text-forest/70">
          {m.typ === 'video' ? (
            <video src={m.url} poster={m.vorschau} muted playsInline className="h-20 w-auto rounded-lg bg-hell object-cover" />
          ) : (
            <img src={m.url} alt={`Bild ${m.format}`} className="h-20 w-auto rounded-lg bg-hell object-cover" loading="lazy" />
          )}
          {m.typ === 'video' ? 'Clip' : 'Bild'} {m.format}
        </a>
      ))}
    </div>
  )
}
