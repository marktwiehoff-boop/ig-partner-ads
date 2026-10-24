// Anzeigentexte über die Claude API. Kontext ist immer das IG-Wissen
// (Markenstimme + Markenwissen). Das Ergebnis wird gegen die Markenregeln
// geprüft und bei Verstößen bis zu zweimal zur Korrektur zurückgegeben.

import Anthropic from '@anthropic-ai/sdk'
import { pruefeCreative, LIMITS } from '../../../shared/markenregeln.js'
import { MOTIVE, CTA_TYPEN } from '../../../shared/motive.js'

export const MODELL = process.env.CLAUDE_MODELL || 'claude-opus-5-5'
const MAX_KORREKTUREN = 2

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['varianten'],
  properties: {
    varianten: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['motiv', 'hook', 'haupttext', 'ueberschrift', 'cta_typ', 'bild_idee', 'quellen'],
        properties: {
          motiv: { type: 'string', enum: Object.keys(MOTIVE) },
          hook: { type: 'string' },
          haupttext: { type: 'string' },
          ueberschrift: { type: 'string' },
          cta_typ: { type: 'string', enum: Object.keys(CTA_TYPEN) },
          bild_idee: { type: 'string' },
          quellen: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

export function regelText() {
  return `Du schreibst Meta-Anzeigen (Facebook und Instagram) für die immergrün Franchise GmbH.
Ziel der Anzeigen: Menschen finden, die Franchise-Partner werden und einen eigenen immergrün Store eröffnen wollen.
Der Klick führt zum immergrün Erfolgscheck, einer kurzen Selbsteinschätzung.

Wissensgrundlage:
- Nutze ausschließlich das immergrün-Wissen im Block <immergruen_wissen>. Es ist die einzige Quelle.
- Erfinde keine Zahlen, Namen, Zitate, Orte oder Versprechen. Steht etwas nicht im Wissen, schreib es nicht.
- Keine Umsatz- oder Gewinnversprechen. Keine Garantien.
- Gib in "quellen" die Pfade der Dokumente an, auf die sich die Anzeige stützt.

Markenregeln (verbindlich, jede Verletzung wird automatisch abgelehnt):
- Ansprache immer mit "du" (dein, dich, dir). Nie "Sie", "Ihnen" oder "Ihr" als Höflichkeitsform.
- Keine Semikolons.
- Keine Gedankenstriche als Trenner. Weder "–" noch "—" noch " - ". Bindestriche in Wörtern wie Franchise-Partner sind erlaubt.
- Kurze, klare Sätze. Ein Gedanke pro Satz. Frisch, direkt, warm. Kein Werbesprech, kein Behörden-Deutsch, keine Superlativ-Ketten.
- Lebensfroh, positiv, partnerschaftlich.

Felder:
- hook: erste Zeile, die im Feed stoppt. Höchstens ${LIMITS.hook} Zeichen.
- haupttext: zwei bis vier kurze Sätze. Höchstens ${LIMITS.haupttext} Zeichen. Endet mit einer Einladung zum Erfolgscheck.
- ueberschrift: Überschrift unter dem Bild. Höchstens ${LIMITS.ueberschrift} Zeichen.
- cta_typ: Knopf der Anzeige. Erlaubt: ${Object.entries(CTA_TYPEN).map(([k, v]) => `${k} (${v})`).join(', ')}.
- bild_idee: eine Szene für ein Foto oder einen kurzen Clip, auf Deutsch, ohne Text, Logos oder Schriftzüge im Bild.
  Zeige immergrün so, wie es im Wissen beschrieben ist: ein Store im Shoppingcenter, in der Innenstadt oder am Bahnhof,
  Smoothies, Säfte, Bowls und Salate live vor dem Gast zubereitet, das Team in gebrandeter Arbeitskleidung (Shirt, Schürze, Cap).
  Farben der Marke: dunkles Waldgrün, frisches Grün, Weiß. Nur grünes Obst und Gemüse zeigen. Das Wort für die verbotene Farbe kommt in der Bildidee gar nicht vor, auch nicht verneint.
  Es wird zusätzlich ein echtes Foto aus einem immergrün Store als Vorlage mitgegeben. Beschreibe die Szene so, dass sie dazu passt.

Motive:
${Object.entries(MOTIVE).map(([k, m]) => `- ${k}: ${m.titel}. ${m.idee}`).join('\n')}`
}

export function auftragText({ region, motive, anzahlJeMotiv, hinweis, vorlage }) {
  const staedte = (region.staedte || []).map((s) => s.name).join(', ')
  const teile = [
    `Region: ${region.name} (${staedte}, Umkreis ${region.umkreis_km} km).`,
    `Schreibe je Motiv ${anzahlJeMotiv} Variante(n) für diese Motive: ${motive.join(', ')}.`,
    'Die Region darf vorkommen, wenn es natürlich klingt. Erfinde aber nichts über die Region.',
  ]
  if (vorlage) teile.push(`Verbessere diese bestehende Anzeige und behalte ihr Motiv:\n${JSON.stringify(vorlage)}`)
  if (hinweis) teile.push(`Wunsch von Rick aus der Expansion: ${hinweis}`)
  return teile.join('\n')
}

function korrekturText(varianten, befunde) {
  return `Diese Anzeigen verletzen Markenregeln. Korrigiere nur die genannten Punkte und gib alle Varianten vollständig zurück.

${varianten.map((v, i) => `Variante ${i + 1}: ${JSON.stringify(v)}\nVerstöße: ${befunde[i].join(', ') || 'keine'}`).join('\n\n')}`
}

/**
 * Erzeugt Varianten. client ist injizierbar für Tests.
 * Rückgabe: [{ ...variante, markencheck: { verstoesse, hinweise } }]
 */
export async function erzeugeTexte({ wissen, region, motive, anzahlJeMotiv = 1, hinweis, vorlage, client }) {
  const anthropic = client || new Anthropic()
  const system = [
    { type: 'text', text: regelText() },
    // Wissen ist der große, stabile Teil: wird gecacht.
    { type: 'text', text: `<immergruen_wissen>\n${wissen.text}\n</immergruen_wissen>`, cache_control: { type: 'ephemeral' } },
  ]

  let auftrag = auftragText({ region, motive, anzahlJeMotiv, hinweis, vorlage })
  let varianten = []
  for (let runde = 0; runde <= MAX_KORREKTUREN; runde++) {
    varianten = await frage(anthropic, system, auftrag)
    const befunde = varianten.map((v) => pruefeCreative(v).verstoesse)
    if (befunde.every((b) => b.length === 0)) break
    if (runde < MAX_KORREKTUREN) auftrag = korrekturText(varianten, befunde)
  }

  const erlaubt = new Set(motive)
  return varianten
    .filter((v) => erlaubt.has(v.motiv))
    .map((v) => ({ ...v, markencheck: pruefeCreative(v) }))
}

async function frage(anthropic, system, auftrag) {
  const antwort = await anthropic.beta.messages.create({
    model: MODELL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system,
    messages: [{ role: 'user', content: auftrag }],
  })
  if (antwort.stop_reason === 'refusal') {
    throw new Error('Claude hat die Anfrage abgelehnt. Formuliere den Wunsch anders.')
  }
  if (antwort.stop_reason === 'max_tokens') {
    throw new Error('Die Antwort war zu lang. Erzeuge weniger Varianten auf einmal.')
  }
  const text = antwort.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  let daten
  try {
    daten = JSON.parse(text)
  } catch {
    throw new Error('Claude hat kein gültiges JSON geliefert.')
  }
  if (!Array.isArray(daten?.varianten) || daten.varianten.length === 0) {
    throw new Error('Claude hat keine Varianten geliefert.')
  }
  return daten.varianten
}
