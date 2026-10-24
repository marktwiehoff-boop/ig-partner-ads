import { describe, it, expect } from 'vitest'
import { tagesbudgetCent, liveSperren, schutzpauseGrund, gesamtSchutzGrund } from '../../shared/budget.js'

const region = { aktiv: true, monatsbudget_eur: 500, obergrenze_eur: 500 }
const kampagne = { meta_campaign_id: 'c1', status: 'pausiert' }

describe('tagesbudgetCent', () => {
  it('teilt durch 31 und rundet ab', () => {
    expect(tagesbudgetCent(500)).toBe(1612)
    expect(tagesbudgetCent('310')).toBe(1000)
  })
  it('31 Tage überschreiten das Monatsbudget nie', () => {
    for (const b of [1, 99.99, 500, 1234.56]) expect(tagesbudgetCent(b) * 31).toBeLessThanOrEqual(b * 100)
  })
  it('nie negativ', () => {
    expect(tagesbudgetCent(-5)).toBe(0)
  })
})

describe('liveSperren', () => {
  const ok = { region, kampagne, ausgabenMonatEur: 0, metaTagesbudgetCent: 1612, anzahlAnzeigen: 2 }

  it('alles in Ordnung', () => {
    expect(liveSperren(ok)).toEqual([])
  })
  it('Tagesbudget bei Meta zu hoch', () => {
    expect(liveSperren({ ...ok, metaTagesbudgetCent: 1613 })[0]).toMatch(/über dem erlaubten Wert/)
  })
  it('keine Anzeige', () => {
    expect(liveSperren({ ...ok, anzahlAnzeigen: 0 })).toHaveLength(1)
  })
  it('live bleibt erlaubt (neue Anzeigen aktivieren)', () => {
    expect(liveSperren({ ...ok, kampagne: { ...kampagne, status: 'live' } })).toEqual([])
  })
  it('Fehler oder im Aufbau sperrt', () => {
    expect(liveSperren({ ...ok, kampagne: { ...kampagne, status: 'fehler' } })[0]).toMatch(/nur aus "pausiert"/)
    expect(liveSperren({ ...ok, kampagne: { ...kampagne, status: 'wird_angelegt' } })).toHaveLength(1)
  })
  it('Budget ausgeschöpft', () => {
    expect(liveSperren({ ...ok, ausgabenMonatEur: 500 }).join()).toMatch(/ausgeschöpft/)
  })
  it('inaktive Region', () => {
    expect(liveSperren({ ...ok, region: { ...region, aktiv: false } })).toContain('Die Region ist nicht aktiv.')
  })
})

describe('schutzpauseGrund', () => {
  it('kein Grund am Monatsanfang', () => {
    expect(schutzpauseGrund({ region, ausgabenMonatEur: 100, tagesbudgetCent: 1612 })).toBeNull()
  })
  it('pausiert kurz vor der Obergrenze', () => {
    // 500 - 1,75 * 16,12 = 471,79
    expect(schutzpauseGrund({ region, ausgabenMonatEur: 471.7, tagesbudgetCent: 1612 })).toBeNull()
    expect(schutzpauseGrund({ region, ausgabenMonatEur: 472, tagesbudgetCent: 1612 })).toMatch(/Obergrenze/)
  })
  it('gesamt', () => {
    expect(gesamtSchutzGrund({ ausgabenGesamtEur: 1500, gesamtObergrenzeEur: 1500 })).toMatch(/Gesamt-Obergrenze/)
    expect(gesamtSchutzGrund({ ausgabenGesamtEur: 10, gesamtObergrenzeEur: 1500 })).toBeNull()
  })
})
