import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase } from './fake-supabase.js'

const zustand = vi.hoisted(() => ({ sb: null }))
vi.mock('../../netlify/functions/lib/supabase.mjs', async (orig) => ({
  ...(await orig()),
  serviceClient: () => zustand.sb,
}))

const { schalten } = await import('../../netlify/functions/kampagne-schalten.mjs')
const { budgetUebertragen } = await import('../../netlify/functions/budget-uebertragen.mjs')
const { kampagneAnlegen } = await import('../../netlify/functions/kampagne-anlegen-background.mjs')
const { kennzahlenAbholen } = await import('../../netlify/functions/lib/kennzahlen.mjs')

const RICK = { id: 'rick' }
const region = {
  id: 'r1', name: 'Berlin', slug: 'berlin', aktiv: true, umkreis_km: 25,
  monatsbudget_eur: 500, obergrenze_eur: 500, staedte: [{ name: 'Berlin', lat: 52.52, lng: 13.4 }],
}
const cfg = { konto: 'act_1', pixelId: 'px', pageId: 'pg', instagramUserId: '', dsaBeguenstigter: 'immergrün', sonderkategorie: '' }

function metaFake(antworten = {}) {
  const aufrufe = []
  const graph = vi.fn(async (_cfg, methode, pfad, werte) => {
    aufrufe.push({ methode, pfad, werte })
    const f = antworten[`${methode} ${pfad}`]
    if (typeof f === 'function') return f(werte)
    if (f) return f
    if (methode === 'POST' && pfad.endsWith('/adimages')) return { images: { bytes: { hash: 'hash1' } } }
    if (methode === 'POST' && pfad.startsWith('act_1/')) return { id: `${pfad.split('/')[1]}_${aufrufe.length}` }
    return { success: true }
  })
  return { graph, aufrufe }
}

function lage(extra = {}) {
  return {
    region,
    kampagne: { id: 'k1', region_id: 'r1', meta_campaign_id: 'c1', meta_adset_id: 's1', status: 'pausiert' },
    einst: { gesamt_obergrenze_eur: 1500 },
    anzeigen: [
      { id: 'a1', status: 'freigegeben', meta_ad_id: 'ad1', meta_video_ad_id: 'vad1' },
      { id: 'a2', status: 'archiviert', meta_ad_id: 'ad2' },
    ],
    ausgabenRegion: 0,
    ausgabenGesamt: 0,
    ...extra,
  }
}

beforeEach(() => {
  zustand.sb = fakeSupabase({ ads_campaigns: [{ id: 'k1', region_id: 'r1', status: 'pausiert' }], ads_approvals: [] })
})

describe('Live schalten', () => {
  it('ohne Bestätigung passiert nichts', async () => {
    const m = metaFake()
    await expect(schalten({ user: RICK, body: { region_id: 'r1', aktion: 'live' } }, { graph: m.graph, cfg, lageDerRegion: async () => lage() }))
      .rejects.toThrow(/Bestätigung/)
    expect(m.aufrufe).toHaveLength(0)
  })

  it('schaltet Anzeigen, dann Anzeigengruppe, zuletzt Kampagne und protokolliert', async () => {
    const m = metaFake({ 'GET s1': { daily_budget: '1612', status: 'PAUSED' } })
    const fetchFn = vi.fn(async (url, opt) => {
      m.aufrufe.push({ methode: 'POST', pfad: new URL(url).pathname.split('/').pop(), werte: Object.fromEntries(opt.body) })
      return new Response('{"success":true}')
    })
    const r = await schalten(
      { user: RICK, body: { region_id: 'r1', aktion: 'live', bestaetigt: true } },
      { graph: m.graph, cfg: { ...cfg, version: 'v26.0', token: 't' }, fetchFn, lageDerRegion: async () => lage() },
    )
    expect(r.status).toBe('live')
    const status = m.aufrufe.filter((a) => a.werte?.status).map((a) => `${a.pfad}:${a.werte.status}`)
    expect(status).toEqual(['ad2:PAUSED', 'ad1:ACTIVE', 'vad1:ACTIVE', 's1:ACTIVE', 'c1:ACTIVE'])
    const freigabe = zustand.sb.db.ads_approvals[0]
    expect(freigabe).toMatchObject({ art: 'kampagne_live', user_id: 'rick', objekt_id: 'k1' })
    expect(freigabe.details.tagesbudget_cent).toBe(1612)
    expect(zustand.sb.db.ads_campaigns[0].status).toBe('live')
  })

  it('sperrt bei zu hohem Tagesbudget bei Meta', async () => {
    const m = metaFake({ 'GET s1': { daily_budget: '5000' } })
    const r = await schalten({ user: RICK, body: { region_id: 'r1', aktion: 'live', bestaetigt: true } },
      { graph: m.graph, cfg, lageDerRegion: async () => lage() })
    expect(r.gesperrt.join()).toMatch(/über dem erlaubten Wert/)
    expect(m.aufrufe.filter((a) => a.methode === 'POST')).toHaveLength(0)
    expect(zustand.sb.db.ads_approvals).toHaveLength(0)
  })

  it('sperrt bei ausgeschöpftem Budget und erreichter Gesamtgrenze', async () => {
    const m = metaFake({ 'GET s1': { daily_budget: '1612' } })
    const r = await schalten({ user: RICK, body: { region_id: 'r1', aktion: 'live', bestaetigt: true } },
      { graph: m.graph, cfg, lageDerRegion: async () => lage({ ausgabenRegion: 500, ausgabenGesamt: 1500 }) })
    expect(r.gesperrt.join(' ')).toMatch(/ausgeschöpft/)
    expect(r.gesperrt.join(' ')).toMatch(/Gesamt-Obergrenze/)
  })

  it('pausieren geht ohne Bestätigung', async () => {
    const fetchFn = vi.fn(async () => new Response('{"success":true}'))
    const r = await schalten({ user: RICK, body: { region_id: 'r1', aktion: 'pause' } },
      { cfg: { ...cfg, version: 'v26.0', token: 't' }, fetchFn, lageDerRegion: async () => lage() })
    expect(r.status).toBe('pausiert')
    expect(Object.fromEntries(fetchFn.mock.calls[0][1].body).status).toBe('PAUSED')
    expect(zustand.sb.db.ads_approvals[0].art).toBe('kampagne_pause')
  })
})

describe('Budget übertragen', () => {
  it('nimmt den Wert aus der Datenbank, nie aus der Anfrage', async () => {
    const m = metaFake({ 'GET s1': { daily_budget: '1000' } })
    const r = await budgetUebertragen(
      { user: RICK, body: { region_id: 'r1', bestaetigt: true, daily_budget: 999999 } },
      { graph: m.graph, cfg, lageDerRegion: async () => lage() },
    )
    expect(r).toMatchObject({ tagesbudget_cent: 1612, vorher_cent: 1000, geaendert: true })
    expect(m.aufrufe.at(-1)).toMatchObject({ methode: 'POST', pfad: 's1', werte: { daily_budget: 1612 } })
    expect(zustand.sb.db.ads_approvals[0].details).toMatchObject({ tagesbudget_alt_cent: 1000, tagesbudget_neu_cent: 1612 })
  })

  it('ohne Bestätigung nichts', async () => {
    await expect(budgetUebertragen({ user: RICK, body: { region_id: 'r1' } }, { cfg })).rejects.toThrow(/Bestätigung/)
  })
})

describe('Kampagne anlegen', () => {
  it('legt alles pausiert an und speichert die Meta-IDs', async () => {
    zustand.sb = fakeSupabase({
      ads_regions: [region],
      ads_einstellungen: [{ id: true, landingpage_url: 'https://erfolgscheck.test/', gesamt_obergrenze_eur: 1500 }],
      ads_campaigns: [],
      ads_creatives: [
        { id: 'cr-1111111111', region_id: 'r1', status: 'freigegeben', meta_ad_id: null, motiv: 'lifestyle', hook: 'Dein Laden?', haupttext: 'Wir helfen dir.', ueberschrift: 'Jetzt prüfen', cta_typ: 'LEARN_MORE', medien: [{ typ: 'bild', format: '4:5', url: 'https://speicher.test/b.jpg' }] },
        { id: 'cr-2222222222', region_id: 'r1', status: 'entwurf', meta_ad_id: null, motiv: 'lifestyle', medien: [{ typ: 'bild', format: '4:5', url: 'x' }] },
      ],
    })
    process.env.META_ACCESS_TOKEN = 't'; process.env.META_AD_ACCOUNT_ID = '1'; process.env.META_PAGE_ID = 'pg'; process.env.META_PIXEL_ID = 'px'
    const m = metaFake({ 'GET act_1/campaigns_1': { status: 'PAUSED' } })
    m.graph.mockImplementationOnce(async (_c, methode, pfad, werte) => { m.aufrufe.push({ methode, pfad, werte }); return { id: 'camp1' } })
    const fetchFn = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
    const r = await kampagneAnlegen({ eingabe: { region_id: 'r1' } }, RICK, async () => {}, { graph: m.graph, fetchFn })

    const posts = m.aufrufe.filter((a) => a.methode === 'POST')
    expect(posts.map((p) => p.pfad)).toEqual(['act_1/campaigns', 'act_1/adsets', 'act_1/adimages', 'act_1/adcreatives', 'act_1/ads'])
    for (const p of posts.filter((x) => 'status' in (x.werte || {}))) expect(p.werte.status).toBe('PAUSED')
    expect(posts[1].werte.daily_budget).toBe(1612)
    const c = zustand.sb.db.ads_creatives[0]
    expect(c.meta_ad_id).toMatch(/^ads_/)
    expect(zustand.sb.db.ads_creatives[1].meta_ad_id).toBeNull()
    expect(r).toMatchObject({ neu: 1, status: 'pausiert' })
    expect(zustand.sb.db.ads_campaigns[0]).toMatchObject({ meta_campaign_id: 'camp1', status: 'pausiert', tagesbudget_cent: 1612 })
  })

  it('ohne freigegebene Anzeige bricht es ab, bevor bei Meta etwas entsteht', async () => {
    zustand.sb = fakeSupabase({ ads_regions: [region], ads_einstellungen: [{ id: true, landingpage_url: 'https://x.test' }], ads_campaigns: [], ads_creatives: [] })
    const m = metaFake()
    await expect(kampagneAnlegen({ eingabe: { region_id: 'r1' } }, RICK, async () => {}, { graph: m.graph })).rejects.toThrow(/keine freigegebene/)
    expect(m.aufrufe).toHaveLength(0)
  })
})

describe('Kennzahlen', () => {
  it('speichert je Anzeige und Tag und pausiert zum Schutz', async () => {
    zustand.sb = fakeSupabase({
      ads_regions: [region],
      ads_einstellungen: [{ id: true, gesamt_obergrenze_eur: 1500 }],
      ads_campaigns: [{ id: 'k1', region_id: 'r1', meta_campaign_id: 'c1', status: 'live', tagesbudget_cent: 1612 }],
      ads_creatives: [{ id: 'cr1', region_id: 'r1', meta_ad_id: 'ad1' }],
      ads_metrics_daily: [],
      ads_protokoll: [],
    })
    const graphAlle = vi.fn(async () => [
      { date_start: '2026-10-16', ad_id: 'ad1', campaign_id: 'c1', spend: '12.30', impressions: '1000', clicks: '20', actions: [{ action_type: 'lead', value: '2' }] },
    ])
    const setzeStatus = vi.fn(async () => ({}))
    const r = await kennzahlenAbholen({
      heute: new Date('2026-10-17T05:15:00Z'),
      deps: { cfg, graphAlle, setzeStatus, ausgabenMonat: async () => ({ jeRegion: { r1: 480 }, gesamt: 480 }) },
    })
    expect(graphAlle.mock.calls[0][2].time_range).toEqual({ since: '2026-10-14', until: '2026-10-17' })
    expect(zustand.sb.db.ads_metrics_daily[0]).toMatchObject({ datum: '2026-10-16', region_id: 'r1', creative_id: 'cr1', ausgaben_eur: 12.3, leads_meta: 2 })
    expect(setzeStatus).toHaveBeenCalledWith(cfg, 'c1', 'PAUSED')
    expect(r.pausiert[0].grund).toMatch(/Obergrenze/)
    expect(zustand.sb.db.ads_campaigns[0].status).toBe('pausiert')
    expect(zustand.sb.db.ads_protokoll.map((p) => p.ereignis)).toEqual(['schutzpause', 'kennzahlen_abgeholt'])
  })

  it('lässt Kampagnen im Rahmen laufen', async () => {
    zustand.sb = fakeSupabase({
      ads_regions: [region], ads_einstellungen: [{ id: true, gesamt_obergrenze_eur: 1500 }],
      ads_campaigns: [{ id: 'k1', region_id: 'r1', meta_campaign_id: 'c1', status: 'live', tagesbudget_cent: 1612 }],
      ads_creatives: [], ads_metrics_daily: [], ads_protokoll: [],
    })
    const setzeStatus = vi.fn()
    await kennzahlenAbholen({ deps: { cfg, graphAlle: async () => [], setzeStatus, ausgabenMonat: async () => ({ jeRegion: { r1: 100 }, gesamt: 100 }) } })
    expect(setzeStatus).not.toHaveBeenCalled()
  })
})
