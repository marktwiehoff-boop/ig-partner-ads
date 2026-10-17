import { useEffect, useRef } from 'react'

export function Seite({ titel, unter, aktion, children }) {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-28 pt-5 md:pb-10">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl leading-tight">{titel}</h1>
          {unter && <p className="mt-1 text-sm text-forest/70">{unter}</p>}
        </div>
        {aktion}
      </div>
      {children}
    </div>
  )
}

export function Meldung({ art = 'info', children }) {
  if (!children) return null
  const farbe = {
    info: 'bg-hell text-forest',
    ok: 'bg-fresh/25 text-forest',
    fehler: 'bg-igred/10 text-igred border border-igred/30',
  }[art]
  return <div role={art === 'fehler' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 text-sm ${farbe}`}>{children}</div>
}

export function Laden({ text = 'Lädt …' }) {
  return (
    <div className="flex items-center gap-3 py-6 text-sm text-forest/70" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-forest/20 border-t-forest" />
      {text}
    </div>
  )
}

export function Chip({ farbe = 'bg-hell text-forest', children }) {
  return <span className={`chip ${farbe}`}>{children}</span>
}

/** Bestätigungsdialog. Live schalten und Budget brauchen ein Häkchen. */
export function Dialog({ offen, titel, children, onSchliessen }) {
  const ref = useRef(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (offen && !d.open) d.showModal()
    if (!offen && d.open) d.close()
  }, [offen])
  return (
    <dialog
      ref={ref}
      onClose={onSchliessen}
      className="w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-cream p-0 text-forest backdrop:bg-dunkel/60"
    >
      {offen && (
        <div className="p-5">
          <h2 className="mb-3 text-2xl">{titel}</h2>
          {children}
        </div>
      )}
    </dialog>
  )
}

export function Balken({ wert, max, grenze }) {
  const proz = max > 0 ? Math.min(100, (wert / max) * 100) : 0
  const grenzeProz = grenze && max > 0 ? Math.min(100, (grenze / max) * 100) : null
  const farbe = proz >= 95 ? 'bg-igred' : 'bg-fresh'
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-hell" aria-hidden="true">
      <div className={`h-full ${farbe}`} style={{ width: `${proz}%` }} />
      {grenzeProz != null && grenzeProz < 100 && <div className="absolute top-0 h-full w-0.5 bg-forest" style={{ left: `${grenzeProz}%` }} />}
    </div>
  )
}
