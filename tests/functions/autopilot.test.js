import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase } from './fake-supabase.js'

const zustand = vi.hoisted(() => ({ sb: null }))
vi.mock('../../netlify/functions/lib/supabase.mjs', async (orig) => ({
  ...(await orig()),
  serviceClient: () => zustand.sb,
}))

const { planeRegion, regionBearbeiten, autopilotLauf, wocheOptimieren, abgelehnteVersuche } = await import('../../netlify/functions/lib/autopilot.mjs')
const { schwacheMotive, wochenbeginn } = await import('../../netlify/functions/lib/optimierung.mjs')
const { pruefeAnzeige, befundeText } = await import('../../netlify/functions/lib/pruefer.mjs')
const { internesGeheimnis, internGeprueft } = await import('../../netlify/functions/lib/intern.mjs')
const { bereitschaftErmitteln } = await import('../../netlify/functions/bereitschaft.mjs')

const RICK = '00000000-0000-0000-0000-00000000000e'
const region = {
  id: 'r1', name: 'Berlin', slug: 'berlin', aktiv: true, autopilot: true, autopilot_von: RICK, freigabe_modus: 'automatisch',
  umkreis_km: 25, monatsbudget_eur: 500, obergrenze_eur: 500, staedte: [{ name: 'Berlin', lat: 52.5, lng: 13.4 }],
}
const einst = { gesamt_obergrenze_eur: 1500 }
const bild = [{ typ: 'bild', format: '3:4', url: 'https://x/b.jpg' }]
const ok = { bestanden: true, befunde: [] }
const heute = new Date('2026-10-20T08:00:00Z')

const c = (extra) => ({
  id: extra.id || `c-${extra.motiv}`, region_id: 'r1', status: 'entwurf', hook: 'Dein Laden?', haupttext: 'Wir begleiten dich.',
  ueberschrift: 'Erfolgscheck', bild_idee: 'Theke', medien: [], markencheck: {}, meta_ad_id: null, meta_aktiv: false,
  created_at: '2026-10-19T10:00:00Z', updated_at: '2026-10-19T10:00:00Z', ...extra,
})

describe('planeRegion', () => {
  it('ohne Autopilot passiert nichts', () => {
    expect(planeRegion({ region: { ...region, autopilot: false }, creatives: [], einst, heute }).schritte).toEqual([])
  })

  it('leere Region: erst Texte für alle vier Motive', () => {
    const p = planeRegion({ region, kampagne: null, creatives: [], einst, heute })
    expect(p.schritte).toEqual([{ art: 'texte', motive: ['gruendergeschichte', 'zahlen_sicherheit', 'lifestyle', 'echter_partner'], hinweis: '' }])
  })

  it('Entwürfe werden geprüft, geprüfte bekommen Bilder, fertige werden freigegeben', () => {
    const creatives = [
      c({ motiv: 'gruendergeschichte' }),
      c({ motiv: 'zahlen_sicherheit', markencheck: { pruefung: ok } }),
      c({ motiv: 'lifestyle', markencheck: { pruefung: ok }, medien: bild }),
      c({ motiv: 'echter_partner', markencheck: { pruefung: { bestanden: false, befunde: [{ punkt: 'fakten', schwere: 'blockiert', begruendung: 'erfunden' }] } }, status: 'abgelehnt' }),
    ]
    const p = planeRegion({ region, kampagne: null, creatives, einst, heute })
    expect(p.schritte.map((s) => s.art)).toEqual(['texte', 'pruefen', 'bilder', 'freigeben'])
    expect(p.schritte[0].motive).toEqual(['echter_partner'])
    expect(p.schritte[0].hinweis).toMatch(/Vermeide: Echter Partner: fakten: erfunden/)
  })

  it('zweimal abgelehnt: Motiv wartet auf einen Menschen', () => {
    const abgelehnt = (id) => c({ id, motiv: 'lifestyle', status: 'abgelehnt', markencheck: { pruefung: { bestanden: false, befunde: [] } } })
    const p = planeRegion({ region, kampagne: null, creatives: [abgelehnt('a'), abgelehnt('b')], einst, heute })
    expect(p.schritte[0].motive).not.toContain('lifestyle')
    expect(p.hinweise.join()).toMatch(/Lifestyle.*braucht einen Menschen/)
    expect(abgelehnteVersuche([abgelehnt('a'), abgelehnt('b')], 'lifestyle', heute)).toBe(2)
  })

  it('manueller Modus: keine automatische Freigabe, aber Texte und Bilder', () => {
    const p = planeRegion({ region: { ...region, freigabe_modus: 'manuell' }, kampagne: null, creatives: [c({ motiv: 'lifestyle', markencheck: { pruefung: ok }, medien: bild })], einst, heute })
    expect(p.schritte.map((s) => s.art)).toEqual(['texte'])
    expect(p.hinweise.join()).toMatch(/wartet auf Freigabe/)
  })

  it('Markenverstoß blockiert die automatische Freigabe', () => {
    const p = planeRegion({ region, kampagne: null, creatives: [c({ motiv: 'lifestyle', hook: 'Starten Sie jetzt', markencheck: { pruefung: ok }, medien: bild })], einst, heute })
    expect(p.schritte.map((s) => s.art)).not.toContain('freigeben')
  })

  it('freigegeben ohne Meta: Kampagne anlegen; mit Meta und pausiert: live', () => {
    const frei = c({ motiv: 'lifestyle', status: 'freigegeben', markencheck: { pruefung: ok }, medien: bild })
    const p1 = planeRegion({ region, kampagne: null, creatives: [frei], einst, heute })
    expect(p1.schritte.map((s) => s.art)).toEqual(['texte', 'meta_anlegen'])

    const kampagne = { meta_campaign_id: 'c1', meta_adset_id: 's1', status: 'pausiert', tagesbudget_cent: 1612 }
    const p2 = planeRegion({ region, kampagne, creatives: [{ ...frei, meta_ad_id: 'ad1' }], einst, heute })
    expect(p2.schritte.map((s) => s.art)).toEqual(['texte', 'live'])
  })

  it('neue Anzeige bei laufender Kampagne wird aktiviert', () => {
    const kampagne = { meta_campaign_id: 'c1', meta_adset_id: 's1', status: 'live', tagesbudget_cent: 1612 }
    const alt = c({ motiv: 'lifestyle', status: 'freigegeben', medien: bild, meta_ad_id: 'ad1', meta_aktiv: true })
    const neu = c({ motiv: 'echter_partner', status: 'freigegeben', medien: bild, meta_ad_id: 'ad2', meta_aktiv: false })
    const p = planeRegion({ region, kampagne, creatives: [alt, { ...neu }], einst, heute })
    expect(p.schritte.map((s) => s.art)).toContain('live')
    const p2 = planeRegion({ region, kampagne, creatives: [alt, { ...neu, meta_aktiv: true }], einst, heute })
    expect(p2.schritte.map((s) => s.art)).not.toContain('live')
  })

  it('Budget bei Meta wird angeglichen, nie über Monatsbudget/31', () => {
    const kampagne = { meta_campaign_id: 'c1', meta_adset_id: 's1', status: 'live', tagesbudget_cent: 1000 }
    const p = planeRegion({ region, kampagne, creatives: [], einst, heute })
    expect(p.schritte.find((s) => s.art === 'budget')).toEqual({ art: 'budget', tagesbudget_cent: 1612 })
  })

  it('Schutzpause: nicht live, im neuen Monat automatisch weiter', () => {
    const frei = c({ motiv: 'lifestyle', status: 'freigegeben', medien: bild, meta_ad_id: 'ad1' })
    const kampagne = { meta_campaign_id: 'c1', meta_adset_id: 's1', status: 'pausiert', tagesbudget_cent: 1612, letzter_fehler: 'Schutzpause: Budget', updated_at: '2026-10-15T05:15:00Z' }
    const p = planeRegion({ region, kampagne, creatives: [frei], einst, heute })
    expect(p.schritte.map((s) => s.art)).not.toContain('live')
    expect(p.hinweise.join()).toMatch(/Monatsende/)
    const p2 = planeRegion({ region, kampagne, creatives: [frei], einst, heute: new Date('2026-11-02T08:00:00Z') })
    expect(p2.schritte.map((s) => s.art)).toContain('live')
  })

  it('ausgeschöpftes Budget oder Gesamtgrenze: nicht live', () => {
    const frei = c({ motiv: 'lifestyle', status: 'freigegeben', medien: bild, meta_ad_id: 'ad1' })
    const kampagne = { meta_campaign_id: 'c1', meta_adset_id: 's1', status: 'pausiert', tagesbudget_cent: 1612 }
    expect(planeRegion({ region, kampagne, creatives: [frei], einst, heute, ausgabenRegion: 500 }).hinweise.join()).toMatch(/ausgeschöpft/)
    expect(planeRegion({ region, kampagne, creatives: [frei], einst, heute, ausgabenGesamt: 1500 }).hinweise.join()).toMatch(/Gesamt-Obergrenze/)
  })
})

function bausteineFake(sb, extra = {}) {
  const b = {
    ladeLage: async (_sb, regionId) => {
      const r = sb.db.ads_regions.find((x) => x.id === regionId)
      return {
        region: r,
        kampagne: sb.db.ads_campaigns?.find((k) => k.region_id === regionId) || null,
        creatives: sb.db.ads_creatives.filter((x) => x.region_id === regionId),
        einst, ausgabenRegion: 0, ausgabenGesamt: 0,
      }
    },
    wissen: async () => ({ text: 'wissen', dateien: [] }),
    texte: vi.fn(async (job, user) => {
      const neu = job.eingabe.motive.map((m) => c({ id: `neu-${m}`, motiv: m, erstellt_von: user.id, markencheck: { hinweis: job.eingabe.hinweis } }))
      sb.db.ads_creatives.push(...neu)
      return { creative_ids: neu.map((n) => n.id), wissen_dateien: [] }
    }),
    pruefen: vi.fn(async () => ok),
    bilder: vi.fn(async (job) => {
      const cr = sb.db.ads_creatives.find((x) => x.id === job.eingabe.creative_id)
      cr.medien = bild
      return { anzahl: 3, referenz: 'v1', ohne_referenz: false }
    }),
    metaAnlegen: vi.fn(async (job) => {
      let k = sb.db.ads_campaigns.find((x) => x.region_id === job.eingabe.region_id)
      if (!k) { k = { id: 'k1', region_id: job.eingabe.region_id, meta_campaign_id: 'c1', meta_adset_id: 's1', status: 'pausiert', tagesbudget_cent: 1612 }; sb.db.ads_campaigns.push(k) }
      let n = 0
      for (const cr of sb.db.ads_creatives.filter((x) => x.status === 'freigegeben' && !x.meta_ad_id)) { cr.meta_ad_id = `ad-${cr.id}`; n++ }
      return { neu: n, status: 'pausiert' }
    }),
    budget: vi.fn(async () => ({ tagesbudget_cent: 1612, vorher_cent: 1000, geaendert: true })),
    live: vi.fn(async ({ body }) => {
      const k = sb.db.ads_campaigns.find((x) => x.region_id === body.region_id)
      k.status = 'live'
      for (const cr of sb.db.ads_creatives.filter((x) => x.meta_ad_id)) cr.meta_aktiv = true
      return { status: 'live', anzeigen: 1 }
    }),
    jetzt: () => Date.now(),
    ...extra,
  }
  sb.rpcs.ads_creative_auto_freigeben = async ({ p_creative_id, p_pruefung }) => {
    const cr = sb.db.ads_creatives.find((x) => x.id === p_creative_id)
    if (!p_pruefung?.bestanden) throw new Error('nicht bestanden')
    cr.status = 'freigegeben'
    cr.freigegeben_am = new Date().toISOString()
    sb.db.ads_approvals.push({ art: 'creative', objekt_id: cr.id, entscheidung: 'freigegeben', details: { automatisch: true }, user_id: RICK })
    return cr
  }
  return b
}

describe('planeRegion ohne Meta-Schlüssel', () => {
  it('bereitet alles bis zur Freigabe vor, legt aber nichts bei Meta an', () => {
    const creatives = [
      c({ motiv: 'gruendergeschichte', status: 'freigegeben', medien: bild, markencheck: { pruefung: ok } }),
      c({ motiv: 'zahlen_sicherheit', markencheck: { pruefung: ok }, medien: bild }),
    ]
    const p = planeRegion({ region, kampagne: null, creatives, einst, heute, metaBereit: false })
    expect(p.schritte.map((s) => s.art)).toEqual(['texte', 'freigeben'])
    expect(p.hinweise.some((h) => /Meta-Schlüssel fehlen/.test(h))).toBe(true)
    const mit = planeRegion({ region, kampagne: null, creatives, einst, heute, metaBereit: true })
    expect(mit.schritte.map((s) => s.art)).toEqual(['texte', 'freigeben', 'meta_anlegen'])
  })
})

describe('regionBearbeiten', () => {
  beforeEach(() => {
    zustand.sb = fakeSupabase({ ads_regions: [region], ads_campaigns: [], ads_creatives: [], ads_approvals: [], ads_protokoll: [] })
  })

  it('läuft von leer bis live, ganz ohne Klick', async () => {
    const b = bausteineFake(zustand.sb)
    const erledigt = await regionBearbeiten('r1', b)
    const arten = erledigt.map((s) => s.art)
    expect(arten[0]).toBe('texte')
    expect(arten).toContain('pruefen')
    expect(arten).toContain('bilder')
    expect(arten).toContain('freigeben')
    expect(arten).toContain('meta_anlegen')
    expect(arten.at(-1)).toBe('live')
    expect(b.texte).toHaveBeenCalledTimes(1)
    expect(b.pruefen).toHaveBeenCalledTimes(4)
    expect(b.bilder).toHaveBeenCalledTimes(4)
    expect(zustand.sb.db.ads_campaigns[0].status).toBe('live')
    expect(zustand.sb.db.ads_creatives.filter((x) => x.status === 'freigegeben')).toHaveLength(4)
    // Freigaben sind Rick zugerechnet, Protokoll lückenlos
    expect(zustand.sb.db.ads_approvals.every((a) => a.user_id === RICK)).toBe(true)
    expect(zustand.sb.db.ads_protokoll.map((p) => p.details.schritt)).toContain('live')
    expect(b.live.mock.calls[0][0].body).toMatchObject({ bestaetigt: true, aktion: 'live' })
    expect(b.live.mock.calls[0][0].user.id).toBe(RICK)
  })

  it('abgelehnte Prüfung: Anzeige abgelehnt, neue Variante mit Korrekturhinweis', async () => {
    const b = bausteineFake(zustand.sb, {
      pruefen: vi.fn()
        .mockResolvedValueOnce({ bestanden: false, befunde: [{ punkt: 'fakten', schwere: 'blockiert', begruendung: 'Zahl erfunden' }] })
        .mockResolvedValue(ok),
    })
    zustand.sb.db.ads_creatives.push(c({ id: 'alt', motiv: 'lifestyle' }))
    await regionBearbeiten('r1', b)
    const alt = zustand.sb.db.ads_creatives.find((x) => x.id === 'alt')
    expect(alt.status).toBe('abgelehnt')
    expect(zustand.sb.db.ads_approvals.find((a) => a.objekt_id === 'alt')).toMatchObject({ entscheidung: 'abgelehnt', user_id: RICK })
    const neu = zustand.sb.db.ads_creatives.find((x) => x.id === 'neu-lifestyle')
    expect(neu).toBeTruthy()
    expect(b.texte.mock.calls.some((k) => /Zahl erfunden/.test(k[0].eingabe.hinweis))).toBe(true)
    expect(neu.status).toBe('freigegeben')
  })

  it('ohne Meta-Schlüssel: Texte, Prüfung, Bilder, Freigabe laufen, dann wartet die Region mit einem Hinweis', async () => {
    const b = bausteineFake(zustand.sb, { metaBereit: () => false })
    const erledigt = await regionBearbeiten('r1', b)
    const arten = erledigt.map((s) => s.art)
    expect(arten).toContain('freigeben')
    expect(arten).not.toContain('meta_anlegen')
    expect(arten).not.toContain('live')
    expect(erledigt.some((s) => s.fehler)).toBe(false)
    expect(b.metaAnlegen).not.toHaveBeenCalled()
    expect(zustand.sb.db.ads_creatives.filter((x) => x.status === 'freigegeben')).toHaveLength(4)
    const hinweise = zustand.sb.db.ads_protokoll.filter((p) => p.details.schritt === 'hinweis' && /Meta-Schlüssel/.test(p.details.text))
    expect(hinweise).toHaveLength(1)
  })

  it('Fehler eines Schritts landet im Protokoll und stoppt die Region für diesen Lauf', async () => {
    const b = bausteineFake(zustand.sb, { texte: vi.fn(async () => { throw new Error('Claude nicht erreichbar') }) })
    const erledigt = await regionBearbeiten('r1', b)
    expect(erledigt).toEqual([{ art: 'texte', motive: expect.any(Array), hinweis: '', fehler: 'Claude nicht erreichbar' }])
    expect(zustand.sb.db.ads_protokoll.at(-1).details).toMatchObject({ schritt: 'texte', fehler: 'Claude nicht erreichbar' })
  })

  it('Zeitbudget: nach Ablauf keine neuen Schritte', async () => {
    let t = 0
    const b = bausteineFake(zustand.sb, { jetzt: () => { t += 6 * 60 * 1000; return t } })
    const erledigt = await regionBearbeiten('r1', b, 0)
    expect(erledigt.length).toBeLessThanOrEqual(2)
  })
})

describe('autopilotLauf', () => {
  it('holt die Sperre, bearbeitet nur Autopilot-Regionen, gibt die Sperre frei', async () => {
    zustand.sb = fakeSupabase({
      ads_regions: [region, { ...region, id: 'r2', name: 'Stuttgart', autopilot: false }],
      ads_campaigns: [], ads_creatives: [], ads_approvals: [], ads_protokoll: [],
      ads_autopilot_lauf: [{ id: true, letzte_optimierung: null }],
    })
    let gesperrt = false
    const sperren = []
    zustand.sb.rpcs.ads_autopilot_sperre_holen = async () => { if (gesperrt) return false; gesperrt = true; return true }
    zustand.sb.rpcs.ads_autopilot_sperre_freigeben = async ({ p_bericht }) => { gesperrt = false; sperren.push(p_bericht) }
    const b = bausteineFake(zustand.sb)
    const bericht = await autopilotLauf({ bausteine: b, heute })
    expect(Object.keys(bericht.regionen)).toEqual(['r1'])
    expect(bericht.regionen.r1.schritte.at(-1)).toBe('live')
    expect(gesperrt).toBe(false)
    expect(sperren).toHaveLength(1)
  })

  it('zweiter Lauf gleichzeitig wird übersprungen', async () => {
    zustand.sb = fakeSupabase({ ads_regions: [], ads_autopilot_lauf: [{ id: true }] })
    zustand.sb.rpcs.ads_autopilot_sperre_holen = async () => false
    expect((await autopilotLauf({ bausteine: bausteineFake(zustand.sb), heute })).uebersprungen).toBe(true)
  })
})

describe('Wöchentliches Lernen', () => {
  const zeilen = [
    { motiv: 'gruendergeschichte', ausgaben_eur: 100, leads: 8, gute_leads: 4 },
    { motiv: 'lifestyle', ausgaben_eur: 120, leads: 6, gute_leads: 1 },
    { motiv: 'zahlen_sicherheit', ausgaben_eur: 90, leads: 2, gute_leads: 0 },
  ]
  const liveSeit = { gruendergeschichte: '2026-09-20', lifestyle: '2026-09-20', zahlen_sicherheit: '2026-10-15' }

  it('pausiert nur deutlich teurere Motive, die lange genug liefen', () => {
    const s = schwacheMotive({ zeilen, liveSeit, heute })
    expect(s.map((x) => x.motiv)).toEqual(['lifestyle'])
    expect(s[0].grund).toMatch(/120,00 € je gutem Lead, bestes Motiv 25,00 €/)
  })
  it('zu wenige Leads: keine Entscheidung', () => {
    expect(schwacheMotive({ zeilen: zeilen.map((z) => ({ ...z, leads: 2 })), liveSeit, heute })).toEqual([])
  })
  it('nie das letzte Motiv pausieren', () => {
    const nur = [{ motiv: 'lifestyle', ausgaben_eur: 300, leads: 12, gute_leads: 1 }, { motiv: 'gruendergeschichte', ausgaben_eur: 10, leads: 2, gute_leads: 1 }]
    const s = schwacheMotive({ zeilen: nur, liveSeit, heute })
    expect(s.length).toBeLessThan(2)
  })
  it('wochenbeginn ist der Montag', () => {
    expect(wochenbeginn(new Date('2026-10-22T10:00:00Z'))).toBe('2026-10-19')
    expect(wochenbeginn(new Date('2026-10-19T00:30:00Z'))).toBe('2026-10-19')
  })

  it('wocheOptimieren pausiert die Anzeigen des schwachen Motivs und archiviert sie', async () => {
    zustand.sb = fakeSupabase({
      ads_creatives: [
        c({ id: 'g', motiv: 'gruendergeschichte', status: 'freigegeben', meta_ad_id: 'ad-g', freigegeben_am: '2026-09-20' }),
        c({ id: 'l', motiv: 'lifestyle', status: 'freigegeben', meta_ad_id: 'ad-l', meta_video_ad_id: 'vad-l', freigegeben_am: '2026-09-20' }),
      ],
      ads_protokoll: [],
    })
    zustand.sb.rpcs.ads_dashboard = async () => zeilen.map((z) => ({ ...z, region_id: 'r1' }))
    const setzeStatusFn = vi.fn(async () => ({}))
    const s = await wocheOptimieren('r1', { cfg: {}, setzeStatusFn, heute })
    expect(s.map((x) => x.motiv)).toEqual(['lifestyle'])
    expect(setzeStatusFn.mock.calls.map((k) => k[1])).toEqual(['ad-l', 'vad-l'])
    expect(zustand.sb.db.ads_creatives.find((x) => x.id === 'l').status).toBe('archiviert')
    expect(zustand.sb.db.ads_creatives.find((x) => x.id === 'g').status).toBe('freigegeben')
    expect(zustand.sb.db.ads_protokoll[0].details).toMatchObject({ schritt: 'optimierung', motiv: 'lifestyle' })
  })
})

describe('Prüfer', () => {
  it('bestanden nur ohne blockierende Befunde', async () => {
    const create = vi.fn().mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ bestanden: true, zusammenfassung: 'ok', befunde: [{ punkt: 'versprechen', schwere: 'blockiert', begruendung: 'garantiert' }] }) }] })
    const r = await pruefeAnzeige({ wissen: { text: 'w' }, region, creative: c({ motiv: 'lifestyle' }), client: { beta: { messages: { create } } } })
    expect(r.bestanden).toBe(false)
    expect(befundeText(r)).toBe('versprechen: garantiert')
    expect(create.mock.calls[0][0].system[1].cache_control).toEqual({ type: 'ephemeral' })
    expect(create.mock.calls[0][0].messages[0].content).toMatch(/Region: Berlin/)
  })
})

describe('Internes Geheimnis', () => {
  it('wird aus dem Serverschlüssel abgeleitet und geprüft', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'geheim'
    const g = internesGeheimnis()
    expect(g).toHaveLength(64)
    expect(internGeprueft(new Request('https://x', { headers: { 'x-intern': g } }))).toBe(true)
    expect(internGeprueft(new Request('https://x', { headers: { 'x-intern': 'falsch' } }))).toBe(false)
    expect(internGeprueft(new Request('https://x'))).toBe(false)
  })
})

describe('Bereitschaft', () => {
  const env = { IGWISSEN_TOKEN: 't', ANTHROPIC_API_KEY: 'a', HF_CREDENTIALS: 'k:s', META_ACCESS_TOKEN: 'm', META_AD_ACCOUNT_ID: '1', META_PAGE_ID: 'p', META_PIXEL_ID: 'x', LEAD_WEBHOOK_SECRET: 'g' }
  const jetzt = new Date('2026-10-24T10:00:00Z').getTime()

  it('alles grün, wenn Datenbank, Schlüssel und Zeitplan da sind', async () => {
    zustand.sb = fakeSupabase({ ads_regions: [region], ads_autopilot_lauf: [{ id: true, letzter_lauf: '2026-10-24T09:55:00Z', laeuft_seit: null }] })
    const b = await bereitschaftErmitteln({ env, jetzt })
    expect(b.bereit).toBe(true)
    expect(b.punkte.every((p) => p.ok)).toBe(true)
    expect(b.punkte.find((p) => p.schluessel === 'regionen').text).toContain('Berlin')
    expect(JSON.stringify(b)).not.toContain('k:s')
  })

  it('nennt fehlende Meta-Schlüssel und den nächsten Handgriff, ohne Werte zu zeigen', async () => {
    zustand.sb = fakeSupabase({ ads_regions: [{ ...region, autopilot: false }], ads_autopilot_lauf: [{ id: true, letzter_lauf: '2026-10-24T09:00:00Z' }] })
    const b = await bereitschaftErmitteln({ env: { ...env, META_PAGE_ID: '', LEAD_WEBHOOK_SECRET: '' }, jetzt })
    expect(b.bereit).toBe(false)
    const meta = b.punkte.find((p) => p.schluessel === 'meta')
    expect(meta.ok).toBe(false)
    expect(meta.text).toBe('Meta-Schlüssel fehlen: META_PAGE_ID')
    expect(meta.hilfe).toMatch(/README/)
    expect(b.punkte.find((p) => p.schluessel === 'zeitplan').ok).toBe(false)
    expect(b.punkte.find((p) => p.schluessel === 'regionen').hilfe).toMatch(/Partnersuche starten/)
    expect(b.punkte.find((p) => p.schluessel === 'lead').ok).toBe(false)
  })

  it('fehlende Tabelle heißt: Nachtrag 0007 fehlt', async () => {
    zustand.sb = fakeSupabase({ ads_regions: [] })
    const from = zustand.sb.from
    zustand.sb.from = (t) => t !== 'ads_autopilot_lauf' ? from(t)
      : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'relation "ads_autopilot_lauf" does not exist' } }) }) }) }
    const b = await bereitschaftErmitteln({ env, jetzt })
    const db = b.punkte.find((p) => p.schluessel === 'datenbank')
    expect(db.ok).toBe(false)
    expect(db.hilfe).toMatch(/SUPABASE_DB_URL|0007/)
    expect(b.bereit).toBe(false)
  })
})
