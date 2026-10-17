// Markenregeln aus Bauplan 3B und IG-Wissen (immergruen-markenstimme.md).
// Dieselben harten Regeln prüft die Datenbank in ads_markenverstoesse().
// Ändert sich hier etwas, muss 0002_regeln.sql mitziehen (Tests decken beides).

const DU_WOERTER = /(^|[^\p{L}])(du|dich|dir|dein|deine|deinen|deinem|deiner|deines|ihr|euch|euer|eure|euren|eurem)(?![\p{L}])/iu
const SIE_FORM = /(^|[^\p{L}])(Sie|Ihnen)(?![\p{L}])/u
const IHR_MITTEN_IM_SATZ = /[^.!?\s]\s+(Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)(?![\p{L}])/u
const GELB = /(gelb|yellow|fad20a)/i

export const LIMITS = { hook: 125, haupttext: 600, ueberschrift: 40 }

/** Harte Verstöße eines Textes. Leere Liste = in Ordnung. */
export function markenverstoesse(text) {
  if (!text || !text.trim()) return ['Text fehlt']
  const v = []
  if (text.includes(';')) v.push('Semikolon')
  if (/[–—]/.test(text) || /\s-\s/.test(text)) v.push('Gedankenstrich als Trenner')
  if (SIE_FORM.test(text) || IHR_MITTEN_IM_SATZ.test(text)) v.push('Sie-Ansprache statt du')
  if (!DU_WOERTER.test(text)) v.push('Keine du-Ansprache')
  return v
}

/** Prüft eine komplette Anzeige. verstoesse sperren die Freigabe, hinweise nicht. */
export function pruefeCreative(c) {
  const text = [c.hook, c.haupttext, c.ueberschrift].filter((t) => t != null).join('\n')
  const verstoesse = markenverstoesse(text)
  if (GELB.test(c.bild_idee || '')) verstoesse.push('Gelb in der Bildidee')
  if (!c.ueberschrift || !c.ueberschrift.trim()) verstoesse.push('Überschrift fehlt')

  const hinweise = []
  for (const [feld, max] of Object.entries(LIMITS)) {
    const laenge = (c[feld] || '').length
    if (laenge > max) hinweise.push(`${feldName(feld)} hat ${laenge} Zeichen, empfohlen sind höchstens ${max}`)
  }
  return { verstoesse, hinweise }
}

function feldName(feld) {
  return { hook: 'Hook', haupttext: 'Haupttext', ueberschrift: 'Überschrift' }[feld] || feld
}

// Bildstil, der an jeden Higgsfield-Prompt angehängt wird.
export const BILDSTIL =
  'Natürliches Licht, echte Menschen, frische Bowls und Salate, moderne helle Store-Atmosphäre. ' +
  'Farbwelt dunkles Waldgrün #084B32, frisches Grün #96C31E und cremiges Weiß #F4F1EA. ' +
  'Kein Gelb, keine gelben Flächen oder Gegenstände. Kein Text, keine Schrift, keine Logos im Bild.'
