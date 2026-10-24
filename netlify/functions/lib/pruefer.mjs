// Qualitätsprüfung vor der automatischen Freigabe. Ein zweiter Claude-Durchlauf
// prüft eine Anzeige gegen das IG-Wissen: Stimmt jede Aussage? Passt die
// Markenstimme? Keine Versprechen? Nur wenn nichts blockiert, gibt der
// Autopilot frei. Die harten Markenregeln prüft zusätzlich die Datenbank.

import Anthropic from '@anthropic-ai/sdk'
import { MODELL } from './claude.mjs'
import { MOTIVE } from '../../../shared/motive.js'

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['bestanden', 'befunde', 'zusammenfassung'],
  properties: {
    bestanden: { type: 'boolean' },
    zusammenfassung: { type: 'string' },
    befunde: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['punkt', 'schwere', 'begruendung'],
        properties: {
          punkt: { type: 'string', enum: ['fakten', 'markenstimme', 'versprechen', 'zielgruppe', 'region', 'rechtliches', 'sonstiges'] },
          schwere: { type: 'string', enum: ['blockiert', 'hinweis'] },
          begruendung: { type: 'string' },
        },
      },
    },
  },
}

export function pruefRegeln() {
  return `Du prüfst Meta-Anzeigen der immergrün Franchise GmbH, bevor sie ohne weiteren menschlichen Blick live gehen.
Sei streng. Eine Anzeige geht nur raus, wenn du keinen Punkt mit Schwere "blockiert" findest.

Prüfe gegen das Wissen im Block <immergruen_wissen>:
- fakten: Steht jede Aussage, Zahl, jeder Name und Ort so im Wissen? Erfundenes oder Verdrehtes blockiert.
- markenstimme: du-Ansprache, kurze klare Sätze, warm und direkt, kein Werbesprech, keine Superlativ-Ketten. Grobe Abweichung blockiert.
- versprechen: Umsatz-, Gewinn- oder Erfolgsgarantien blockieren. Auch "sicher", "garantiert", "risikofrei" in Bezug auf Geld.
- zielgruppe: Spricht die Anzeige Menschen an, die Franchise-Partner werden wollen, und lädt zum Erfolgscheck ein? Fehlt das, blockiert es.
- region: Passt der Ortsbezug zur Region? Erfundene Ortsbehauptungen blockieren.
- rechtliches: Diskriminierende Zielgruppenansprache (Alter, Herkunft, Geschlecht) blockiert.
- sonstiges: alles andere als Hinweis.

"bestanden" ist true genau dann, wenn kein Befund "blockiert" ist. Begründe kurz und konkret auf Deutsch.`
}

export function pruefAuftrag({ region, creative }) {
  return `Region: ${region.name} (${(region.staedte || []).map((s) => s.name).join(', ')}).
Motiv: ${MOTIVE[creative.motiv]?.titel || creative.motiv}.

Anzeige:
Hook: ${creative.hook}
Haupttext: ${creative.haupttext}
Überschrift: ${creative.ueberschrift}
Knopf: ${creative.cta_typ}
Bildidee: ${creative.bild_idee}`
}

/** Rückgabe: { bestanden, befunde, zusammenfassung, modell, geprueft_am } */
export async function pruefeAnzeige({ wissen, region, creative, client }) {
  const anthropic = client || new Anthropic()
  const antwort = await anthropic.beta.messages.create({
    model: MODELL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: [
      { type: 'text', text: pruefRegeln() },
      { type: 'text', text: `<immergruen_wissen>\n${wissen.text}\n</immergruen_wissen>`, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: pruefAuftrag({ region, creative }) }],
  })
  if (antwort.stop_reason === 'refusal') throw new Error('Claude hat die Prüfung abgelehnt.')
  const text = antwort.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  let daten
  try {
    daten = JSON.parse(text)
  } catch {
    throw new Error('Die Prüfung hat kein gültiges JSON geliefert.')
  }
  const blockiert = (daten.befunde || []).some((b) => b.schwere === 'blockiert')
  return {
    bestanden: Boolean(daten.bestanden) && !blockiert,
    befunde: daten.befunde || [],
    zusammenfassung: daten.zusammenfassung || '',
    modell: MODELL,
    geprueft_am: new Date().toISOString(),
  }
}

/** Kurztext für Protokoll und Korrektur-Wunsch an den Texter. */
export function befundeText(pruefung) {
  return (pruefung?.befunde || [])
    .filter((b) => b.schwere === 'blockiert')
    .map((b) => `${b.punkt}: ${b.begruendung}`)
    .join(' | ')
}
