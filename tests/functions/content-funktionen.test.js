import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase } from './fake-supabase.js'

const zustand = vi.hoisted(() => ({ sb: null }))
vi.mock('../../netlify/functions/lib/supabase.mjs', async (orig) => ({
  ...(await orig()),
  serviceClient: () => zustand.sb,
}))

const { erzeugeTexte, MODELL } = await import('../../netlify/functions/lib/claude.mjs')
const { ladeMarkenwissen, leereWissenCache } = await import('../../netlify/functions/lib/igwissen.mjs')
const { erzeugeBild, bildPrompt, modellFormat } = await import('../../netlify/functions/lib/higgsfield.mjs')
const { nutzerPruefen } = await import('../../netlify/functions/lib/auth.mjs')
const { texteErzeugen } = await import('../../netlify/functions/texte-erzeugen-background.mjs')
const { medienErzeugen, waehleReferenz } = await import('../../netlify/functions/medien-erzeugen-background.mjs')

const region = { id: 'r1', name: 'Ostbayern', umkreis_km: 25, staedte: [{ name: 'Regensburg' }, { name: 'Passau' }] }
const wissen = { text: '<dokument pfad="content/01_Marke_Branding/immergruen-markenstimme.md">Du und ihr.</dokument>', dateien: ['content/01_Marke_Branding/immergruen-markenstimme.md'] }

function claudeFake(...antworten) {
  const create = vi.fn()
  for (const a of antworten) {
    create.mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ varianten: a }) }] })
  }
  return { client: { beta: { messages: { create } } }, create }
}

const gut = { motiv: 'lifestyle', hook: 'Dein eigener Store?', haupttext: 'Wir begleiten dich.', ueberschrift: 'Mach den Erfolgscheck', cta_typ: 'LEARN_MORE', bild_idee: 'Team lacht im Store', quellen: ['content/01_Marke_Branding/immergruen-markenstimme.md'] }

describe('Claude-Texte', () => {
  it('lädt IG-Wissen als gecachten System-Block und nutzt das Standardmodell', async () => {
    const { client, create } = claudeFake([gut])
    const r = await erzeugeTexte({ wissen, region, motive: ['lifestyle'], client })
    expect(r).toHaveLength(1)
    expect(r[0].markencheck.verstoesse).toEqual([])
    const anfrage = create.mock.calls[0][0]
    expect(anfrage.model).toBe(MODELL)
    expect(anfrage.system[1].text).toContain('<immergruen_wissen>')
    expect(anfrage.system[1].cache_control).toEqual({ type: 'ephemeral' })
    expect(anfrage.system[0].text).toMatch(/Keine Semikolons/)
    expect(anfrage.output_config.format.type).toBe('json_schema')
    expect(anfrage.messages[0].content).toMatch(/Regensburg, Passau/)
  })

  it('schickt Verstöße zur Korrektur zurück', async () => {
    const schlecht = { ...gut, haupttext: 'Wir begleiten Sie; immer.' }
    const { client, create } = claudeFake([schlecht], [gut])
    const r = await erzeugeTexte({ wissen, region, motive: ['lifestyle'], client })
    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[1][0].messages[0].content).toMatch(/Semikolon, Sie-Ansprache statt du/)
    expect(r[0].markencheck.verstoesse).toEqual([])
  })

  it('gibt nach zwei Korrekturen auf und markiert die Verstöße', async () => {
    const schlecht = { ...gut, hook: 'Dein Start – jetzt' }
    const { client, create } = claudeFake([schlecht], [schlecht], [schlecht])
    const r = await erzeugeTexte({ wissen, region, motive: ['lifestyle'], client })
    expect(create).toHaveBeenCalledTimes(3)
    expect(r[0].markencheck.verstoesse).toContain('Gedankenstrich als Trenner')
  })

  it('verwirft Motive, die nicht bestellt waren', async () => {
    const { client } = claudeFake([gut, { ...gut, motiv: 'echter_partner' }])
    const r = await erzeugeTexte({ wissen, region, motive: ['lifestyle'], client })
    expect(r.map((v) => v.motiv)).toEqual(['lifestyle'])
  })

  it('Ablehnung durch Claude wird verständlich gemeldet', async () => {
    const create = vi.fn().mockResolvedValue({ stop_reason: 'refusal', content: [] })
    await expect(erzeugeTexte({ wissen, region, motive: ['lifestyle'], client: { beta: { messages: { create } } } }))
      .rejects.toThrow(/abgelehnt/)
  })
})

describe('IG-Wissen', () => {
  beforeEach(() => {
    leereWissenCache()
    process.env.IGWISSEN_TOKEN = 'tok'
    delete process.env.IGWISSEN_PFADE
  })

  it('liest alle Markdown-Dateien der Domänen', async () => {
    const fetchFn = vi.fn(async (url, opt) => {
      if (opt.headers.accept.includes('raw')) return new Response(`# Inhalt von ${url.split('/contents/')[1].split('?')[0]}`)
      if (url.includes('01_Marke_Branding')) {
        return Response.json([
          { type: 'file', name: 'immergruen-markenstimme.md', path: 'content/01_Marke_Branding/immergruen-markenstimme.md' },
          { type: 'file', name: 'logo.png', path: 'content/01_Marke_Branding/logo.png' },
        ])
      }
      return Response.json([{ type: 'file', name: 'grundsaetze.md', path: 'content/03_Partner_Expansion/grundsaetze.md' }])
    })
    const w = await ladeMarkenwissen({ fetchFn })
    expect(w.dateien).toEqual(['content/01_Marke_Branding/immergruen-markenstimme.md', 'content/03_Partner_Expansion/grundsaetze.md'])
    expect(w.text).toContain('<dokument pfad="content/03_Partner_Expansion/grundsaetze.md">')
    expect(fetchFn.mock.calls[0][1].headers.authorization).toBe('Bearer tok')
  })

  it('ohne Markenstimme keine Texte', async () => {
    const fetchFn = vi.fn(async (url, opt) =>
      opt.headers.accept.includes('raw') ? new Response('x') : Response.json([{ type: 'file', name: 'a.md', path: 'content/x/a.md' }]))
    await expect(ladeMarkenwissen({ fetchFn })).rejects.toThrow(/Markenstimme/)
  })

  it('ohne Token keine Texte', async () => {
    delete process.env.IGWISSEN_TOKEN
    await expect(ladeMarkenwissen({ fetchFn: vi.fn() })).rejects.toThrow(/IGWISSEN_TOKEN/)
  })
})

describe('Higgsfield', () => {
  it('sendet Auftrag mit Key-Header und wartet auf das Bild', async () => {
    process.env.HF_CREDENTIALS = 'id:geheim'
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(Response.json({ request_id: 'req1', status: 'queued' }))
      .mockResolvedValueOnce(Response.json({ status: 'in_progress' }))
      .mockResolvedValueOnce(Response.json({ status: 'completed', images: [{ url: 'https://hf.test/b.jpg' }] }))
    const r = await erzeugeBild('Team im Store', '4:5', { fetchFn, schlafen: async () => {} })
    expect(r.url).toBe('https://hf.test/b.jpg')
    const [url, opt] = fetchFn.mock.calls[0]
    expect(url).toBe('https://api.higgsfield.ai/higgsfield-ai/soul/standard')
    expect(opt.headers.authorization).toBe('Key id:geheim')
    expect(JSON.parse(opt.body)).toMatchObject({ aspect_ratio: '3:4' })
    expect(JSON.parse(opt.body).resolution).toBeUndefined()
    expect(r.format).toBe('3:4')
    expect(JSON.parse(opt.body).prompt).toMatch(/Kein Gelb/)
    expect(fetchFn.mock.calls[1][0]).toBe('https://api.higgsfield.ai/requests/req1/status')
  })

  it('Feldfehler werden lesbar angezeigt', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(Response.json({ detail: [{ loc: ['body', 'aspect_ratio'], msg: 'Input should be 1:1 or 9:16' }] }, { status: 422 }))
    await expect(erzeugeBild('x', '1:1', { fetchFn })).rejects.toThrow('Higgsfield 422: aspect_ratio: Input should be 1:1 or 9:16')
  })

  it('andere Modelle bekommen 4:5 unverändert', () => {
    expect(modellFormat('bytedance/seedream/v4/text-to-image', '4:5')).toBe('4:5')
    expect(modellFormat('higgsfield-ai/soul/standard', '9:16')).toBe('9:16')
  })

  it('Moderation wird verständlich gemeldet', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(Response.json({ request_id: 'req1' }))
      .mockResolvedValueOnce(Response.json({ status: 'nsfw' }))
    await expect(erzeugeBild('x', '1:1', { fetchFn, schlafen: async () => {} })).rejects.toThrow(/Moderation/)
  })

  it('Bildstil hängt an jeder Idee', () => {
    expect(bildPrompt('Bowl')).toMatch(/^Bowl\. .*#084B32/)
  })
})

describe('Login-Prüfung', () => {
  beforeEach(() => {
    zustand.sb = fakeSupabase({ ads_users: [{ id: 'u-rick', rolle: 'expansion' }, { id: 'u-team', rolle: 'viewer' }] })
    zustand.sb.auth._users.tok_rick = { id: 'u-rick' }
    zustand.sb.auth._users.tok_team = { id: 'u-team' }
    zustand.sb.auth._users.tok_neu = { id: 'u-neu' }
  })
  const anfrage = (token) => new Request('https://x.test', { headers: token ? { authorization: `Bearer ${token}` } : {} })

  it('ohne Token 401', async () => {
    await expect(nutzerPruefen(anfrage())).rejects.toMatchObject({ status: 401 })
  })
  it('viewer darf nicht bedienen', async () => {
    await expect(nutzerPruefen(anfrage('tok_team'))).rejects.toMatchObject({ status: 403 })
  })
  it('nicht freigeschaltet', async () => {
    await expect(nutzerPruefen(anfrage('tok_neu'))).rejects.toThrow(/noch nicht freigeschaltet/)
  })
  it('expansion darf', async () => {
    expect((await nutzerPruefen(anfrage('tok_rick'))).rolle).toBe('expansion')
  })
})

describe('Background-Jobs Inhalte', () => {
  it('Texte werden als Entwürfe mit Quellen gespeichert', async () => {
    zustand.sb = fakeSupabase({ ads_regions: [region], ads_creatives: [] })
    const texte = vi.fn(async () => [{ ...gut, markencheck: { verstoesse: [], hinweise: [] } }])
    const r = await texteErzeugen(
      { eingabe: { region_id: 'r1', motive: ['lifestyle', 'quatsch'], anzahl_je_motiv: 5 } },
      { id: 'u-rick' },
      { wissenLaden: async () => wissen, texte },
    )
    expect(texte.mock.calls[0][0]).toMatchObject({ motive: ['lifestyle'], anzahlJeMotiv: 3 })
    expect(r.creative_ids).toHaveLength(1)
    const c = zustand.sb.db.ads_creatives[0]
    expect(c).toMatchObject({ region_id: 'r1', erstellt_von: 'u-rick', hook: gut.hook })
    expect(c.status).toBeUndefined() // Standard in der DB: entwurf
    expect(c.markencheck.quellen).toEqual(gut.quellen)
  })

  it('zu viele Varianten auf einmal werden abgelehnt', async () => {
    await expect(texteErzeugen({ eingabe: { region_id: 'r1', motive: ['lifestyle', 'echter_partner', 'gruendergeschichte'], anzahl_je_motiv: 3 } }, { id: 'u' }))
      .rejects.toThrow(/Höchstens 8/)
  })

  it('Medien landen dauerhaft im Speicher', async () => {
    zustand.sb = fakeSupabase({ ads_creatives: [{ id: 'c1', bild_idee: 'Team im Store', medien: [{ typ: 'bild', format: '1:1', url: 'alt' }] }] })
    const erzeugeBildFake = vi.fn(async (_idee, format) => ({ url: `https://hf.test/${format}.png`, requestId: 'r' }))
    const erzeugeClipFake = vi.fn(async () => ({ url: 'https://hf.test/clip.mp4', requestId: 'v' }))
    const fetchFn = vi.fn(async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } }))
    await medienErzeugen({ eingabe: { creative_id: 'c1', formate: ['4:5', '9:16'], mit_clip: true } }, {}, async () => {},
      { erzeugeBild: erzeugeBildFake, erzeugeClip: erzeugeClipFake, fetchFn })
    const medien = zustand.sb.db.ads_creatives[0].medien
    expect(medien.map((m) => `${m.typ} ${m.format}`)).toEqual(['bild 1:1', 'bild 4:5', 'bild 9:16', 'video 9:16'])
    expect(medien[1].url).toMatch(/^https:\/\/speicher\.test\/ads-medien\/c1\/\d+-4x5\.png$/)
    expect(erzeugeClipFake.mock.calls[0][1]).toBe(medien[2].url)
  })

  it('Gelb in der Bildidee stoppt die Bilderzeugung', async () => {
    zustand.sb = fakeSupabase({ ads_creatives: [{ id: 'c1', bild_idee: 'gelbe Bowl', medien: [] }] })
    await expect(medienErzeugen({ eingabe: { creative_id: 'c1' } }, {}, async () => {}, { erzeugeBild: vi.fn() })).rejects.toThrow(/Gelb/)
  })
})

describe('Bildvorlagen', () => {
  it('gibt die Vorlage an Higgsfield mit', async () => {
    process.env.HF_CREDENTIALS = 'id:geheim'
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(Response.json({ request_id: 'r1', status: 'completed', images: [{ url: 'https://hf.test/b.jpg' }] }))
    const r = await erzeugeBild('Theke', '1:1', { fetchFn, referenzUrl: 'https://speicher.test/referenzen/a.jpg' })
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).image_reference).toEqual({ type: 'image_url', image_url: 'https://speicher.test/referenzen/a.jpg' })
    expect(r.ohneReferenz).toBe(false)
  })

  it('kennt das Modell keine Vorlage, kommt das Bild ohne Vorlage', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(Response.json({ detail: [{ loc: ['body', 'image_reference'], msg: 'Extra inputs are not permitted' }] }, { status: 422 }))
      .mockResolvedValueOnce(Response.json({ request_id: 'r2', status: 'completed', images: [{ url: 'https://hf.test/c.jpg' }] }))
    const r = await erzeugeBild('Theke', '1:1', { fetchFn, referenzUrl: 'https://x/a.jpg' })
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchFn.mock.calls[1][1].body).image_reference).toBeUndefined()
    expect(r.ohneReferenz).toBe(true)
  })

  it('andere 422-Fehler werden nicht verschluckt', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(Response.json({ detail: [{ loc: ['body', 'prompt'], msg: 'zu lang' }] }, { status: 422 }))
    await expect(erzeugeBild('x', '1:1', { fetchFn, referenzUrl: 'https://x/a.jpg' })).rejects.toThrow('prompt: zu lang')
  })

  it('automatisch wird das neueste aktive Store-Foto gewählt', async () => {
    zustand.sb = fakeSupabase({ ads_referenzbilder: [
      { id: 'p1', url: 'p', art: 'produkt', aktiv: true, created_at: '2026-10-03' },
      { id: 's1', url: 's1', art: 'store', aktiv: true, created_at: '2026-10-01' },
      { id: 's2', url: 's2', art: 'store', aktiv: true, created_at: '2026-10-02' },
      { id: 's3', url: 's3', art: 'store', aktiv: false, created_at: '2026-10-04' },
    ] })
    expect((await waehleReferenz(zustand.sb, 'auto')).id).toBe('s2')
    expect(await waehleReferenz(zustand.sb, 'keine')).toBeNull()
    expect((await waehleReferenz(zustand.sb, 'p1')).id).toBe('p1')
  })
})
