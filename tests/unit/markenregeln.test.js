import { describe, it, expect } from 'vitest'
import { markenverstoesse, pruefeCreative } from '../../shared/markenregeln.js'

// Dieselben Fälle wie in tests/db/tests.sql, damit JS und SQL gleich urteilen.
const FAELLE = [
  ['Du willst dein eigenes Ding? Starte mit uns.', []],
  ['Du willst mehr; wir auch.', ['Semikolon']],
  ['Dein Start – unser Wissen.', ['Gedankenstrich als Trenner']],
  ['Dein Start - unser Wissen.', ['Gedankenstrich als Trenner']],
  ['Dein Franchise-Start mit uns.', []],
  ['Starten Sie jetzt mit uns.', ['Sie-Ansprache statt du', 'Keine du-Ansprache']],
  ['Wir zeigen Ihnen, wie es geht. Du lernst schnell.', ['Sie-Ansprache statt du']],
  ['Ihr seid ein Team. Ihr wollt wachsen.', []],
  ['Wir freuen uns auf Ihre Bewerbung, du.', ['Sie-Ansprache statt du']],
]

describe('markenverstoesse', () => {
  it.each(FAELLE)('%s', (text, erwartet) => {
    expect(markenverstoesse(text)).toEqual(erwartet)
  })

  it('erkennt Geviertstrich', () => {
    expect(markenverstoesse('Dein Laden — dein Team.')).toContain('Gedankenstrich als Trenner')
  })

  it('leerer Text', () => {
    expect(markenverstoesse('  ')).toEqual(['Text fehlt'])
  })
})

describe('pruefeCreative', () => {
  const gut = { hook: 'Dein eigener Store?', haupttext: 'Wir begleiten dich.', ueberschrift: 'Jetzt starten', bild_idee: 'Bowl im Licht' }

  it('saubere Anzeige', () => {
    expect(pruefeCreative(gut)).toEqual({ verstoesse: [], hinweise: [] })
  })

  it('Gelb in der Bildidee sperrt', () => {
    expect(pruefeCreative({ ...gut, bild_idee: 'gelbe Wand' }).verstoesse).toContain('Gelb in der Bildidee')
  })

  it('fehlende Überschrift sperrt', () => {
    expect(pruefeCreative({ ...gut, ueberschrift: '' }).verstoesse).toContain('Überschrift fehlt')
  })

  it('zu lange Überschrift ist nur ein Hinweis', () => {
    const r = pruefeCreative({ ...gut, ueberschrift: 'x'.repeat(50) })
    expect(r.verstoesse).toEqual([])
    expect(r.hinweise[0]).toMatch(/Überschrift hat 50 Zeichen/)
  })
})
