const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const zahl = new Intl.NumberFormat('de-DE')

export const euro = (b) => (b == null ? '–' : eur.format(Number(b)))
export const anzahl = (n) => (n == null ? '–' : zahl.format(Number(n)))
export const datumZeit = (d) =>
  d ? new Date(d).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–'

export function zeitraum(art, heute = new Date()) {
  const bis = heute.toISOString().slice(0, 10)
  if (art === 'monat') return { von: `${bis.slice(0, 7)}-01`, bis }
  const tage = art === '7' ? 6 : 29
  return { von: new Date(heute.getTime() - tage * 86400000).toISOString().slice(0, 10), bis }
}

export const KAMPAGNEN_STATUS = {
  entwurf: { text: 'Noch nicht bei Meta', farbe: 'bg-ig-100 text-ig-800' },
  wird_angelegt: { text: 'Wird angelegt', farbe: 'bg-ig-100 text-ig-800' },
  pausiert: { text: 'Pausiert', farbe: 'bg-ig-50 text-forest border border-ig-hairline' },
  live: { text: 'Live', farbe: 'bg-fresh text-forest' },
  fehler: { text: 'Fehler', farbe: 'bg-igred text-white' },
}
