// Wöchentliches Lernen (Bauplan 3E, erste Fassung): Motive, die je gutem
// Lead deutlich teurer sind als das beste Motiv der Region, werden pausiert.
// Pausieren senkt Ausgaben und braucht keine Freigabe. Der Autopilot erzeugt
// danach eine neue Variante für das Motiv. Budget zwischen Regionen zu
// verschieben bleibt Menschen vorbehalten (Vorschlag im Protokoll).

export const MIN_LEADS_REGION = 10
export const MIN_TAGE_LIVE = 14
export const FAKTOR = 2
// Unter dieser Summe wird ein Motiv nicht beurteilt: Mit 10 € lässt sich nichts sagen.
export const MIN_AUSGABEN_MOTIV_EUR = 50

/**
 * zeilen: Zeilen aus ads_dashboard für eine Region und einen Zeitraum
 *   { motiv, ausgaben_eur, leads, gute_leads, kosten_pro_gutem_lead }
 * liveSeit: { motiv: ISO-Datum der Freigabe }
 * Rückgabe: [{ motiv, grund }]
 */
export function schwacheMotive({ zeilen, liveSeit = {}, heute = new Date(), minLeads = MIN_LEADS_REGION, faktor = FAKTOR, minAusgaben = MIN_AUSGABEN_MOTIV_EUR }) {
  const mitMotiv = zeilen.filter((z) => z.motiv)
  const leadsGesamt = mitMotiv.reduce((a, z) => a + Number(z.leads || 0), 0)
  if (leadsGesamt < minLeads) return []

  const mitGuten = mitMotiv.filter((z) => Number(z.gute_leads) > 0)
  if (mitGuten.length === 0) return []
  const beste = Math.min(...mitGuten.map((z) => Number(z.ausgaben_eur) / Number(z.gute_leads)))
  const grenze = beste * faktor
  const schwelle = new Date(heute.getTime() - MIN_TAGE_LIVE * 86400000)

  const schwach = []
  for (const z of mitMotiv) {
    const seit = liveSeit[z.motiv] ? new Date(liveSeit[z.motiv]) : null
    if (!seit || seit > schwelle) continue
    const ausgaben = Number(z.ausgaben_eur || 0)
    const gute = Number(z.gute_leads || 0)
    if (ausgaben < minAusgaben) continue
    if (gute > 0 && ausgaben / gute > grenze) {
      schwach.push({ motiv: z.motiv, grund: `${euro(ausgaben / gute)} je gutem Lead, bestes Motiv ${euro(beste)}` })
    } else if (gute === 0 && ausgaben > grenze) {
      schwach.push({ motiv: z.motiv, grund: `${euro(ausgaben)} ausgegeben ohne guten Lead, bestes Motiv ${euro(beste)} je gutem Lead` })
    }
  }
  // Nie das letzte Motiv pausieren
  if (schwach.length >= mitMotiv.length) schwach.pop()
  return schwach
}

function euro(b) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(b).replace(/\u00a0/g, ' ')
}

/** Montag der Woche als Datum (für "einmal je Woche"). */
export function wochenbeginn(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const tag = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - tag)
  return t.toISOString().slice(0, 10)
}
