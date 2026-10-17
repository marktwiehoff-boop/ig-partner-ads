// Budget-Regeln. Grundsatz: Die App darf Ausgaben nur begrenzen, nie
// eigenständig erhöhen. Mehr Budget gibt es nur durch einen Menschen.

// Meta darf an einzelnen Tagen bis zu 75 % über dem Tagesbudget ausgeben.
export const META_TAGES_SPIELRAUM = 1.75

/**
 * Tagesbudget in Cent aus dem Monatsbudget. Wir teilen immer durch 31,
 * damit auch der längste Monat das Monatsbudget nicht überschreitet.
 */
export function tagesbudgetCent(monatsbudgetEur) {
  const cent = Math.floor((Number(monatsbudgetEur) * 100) / 31)
  return Math.max(0, cent)
}

/**
 * Darf die Kampagne einer Region live gehen? Gibt eine Liste von Gründen
 * zurück, warum nicht. Leere Liste = ja.
 */
export function liveSperren({ region, kampagne, ausgabenMonatEur, metaTagesbudgetCent, anzahlAnzeigen }) {
  const g = []
  if (!region?.aktiv) g.push('Die Region ist nicht aktiv.')
  if (!kampagne || !kampagne.meta_campaign_id) g.push('Die Kampagne ist noch nicht bei Meta angelegt.')
  // "live" ist erlaubt: dann werden neu hinzugekommene, freigegebene Anzeigen aktiviert.
  else if (!['pausiert', 'live'].includes(kampagne.status)) {
    g.push(`Die Kampagne hat den Status "${kampagne.status}". Live schalten geht nur aus "pausiert".`)
  }
  if (!anzahlAnzeigen) g.push('Es gibt keine freigegebene Anzeige in dieser Kampagne.')
  const erlaubt = tagesbudgetCent(region?.monatsbudget_eur ?? 0)
  if (erlaubt <= 0) g.push('Das Monatsbudget der Region ist 0 €.')
  if (metaTagesbudgetCent == null) g.push('Das Tagesbudget bei Meta ist unbekannt.')
  else if (metaTagesbudgetCent > erlaubt) {
    g.push(`Das Tagesbudget bei Meta (${euro(metaTagesbudgetCent / 100)}) liegt über dem erlaubten Wert (${euro(erlaubt / 100)}).`)
  }
  const schutz = schutzpauseGrund({ region, ausgabenMonatEur, tagesbudgetCent: metaTagesbudgetCent ?? erlaubt })
  if (schutz) g.push(schutz)
  return g
}

/**
 * Muss die App eine laufende Kampagne zum Schutz pausieren? Pausieren
 * senkt Ausgaben und ist deshalb ohne Freigabe erlaubt.
 */
export function schutzpauseGrund({ region, ausgabenMonatEur, tagesbudgetCent: tb }) {
  const ausgaben = Number(ausgabenMonatEur || 0)
  const budget = Number(region?.monatsbudget_eur || 0)
  const grenze = Number(region?.obergrenze_eur || 0)
  if (ausgaben >= budget) {
    return `Das Monatsbudget ist ausgeschöpft (${euro(ausgaben)} von ${euro(budget)}).`
  }
  const moeglicherTag = ((tb || 0) / 100) * META_TAGES_SPIELRAUM
  if (ausgaben + moeglicherTag > grenze) {
    return `Ein weiterer Tag könnte die Obergrenze von ${euro(grenze)} überschreiten (bisher ${euro(ausgaben)}).`
  }
  return null
}

/** Gesamt-Schutz über alle Regionen. */
export function gesamtSchutzGrund({ ausgabenGesamtEur, gesamtObergrenzeEur }) {
  if (Number(ausgabenGesamtEur) >= Number(gesamtObergrenzeEur)) {
    return `Die Gesamt-Obergrenze ist erreicht (${euro(ausgabenGesamtEur)} von ${euro(gesamtObergrenzeEur)}).`
  }
  return null
}

export function euro(betrag) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(betrag || 0))
}
