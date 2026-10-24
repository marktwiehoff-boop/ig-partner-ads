// Ziel-Link zur Erfolgscheck-Landingpage. utm_campaign = Region,
// utm_content = Motiv (Bauplan 3C). utm_term trägt die Anzeigen-ID, damit
// Phase 2 jeden Lead genau einer Anzeige zuordnen kann.
export function zielLink(landingpageUrl, { regionSlug, motiv, creativeId }) {
  const url = new URL(landingpageUrl)
  url.searchParams.set('utm_source', 'meta')
  url.searchParams.set('utm_medium', 'paid_social')
  url.searchParams.set('utm_campaign', regionSlug)
  url.searchParams.set('utm_content', motiv)
  if (creativeId) url.searchParams.set('utm_term', creativeId)
  return url.toString()
}
