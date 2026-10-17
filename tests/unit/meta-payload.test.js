import { describe, it, expect } from 'vitest'
import {
  kampagnePayload, anzeigengruppePayload, bildCreativePayload, anzeigePayload,
  waehleBild, leadsAusAktionen, zielgebiet,
} from '../../shared/meta-payload.js'

const cfg = { pixelId: 'px', pageId: 'pg', instagramUserId: 'ig', dsaBeguenstigter: 'immergrün Franchise GmbH', landingpageUrl: 'https://erfolgscheck.example.de/start', sonderkategorie: '' }
const region = {
  name: 'Ostbayern', slug: 'ostbayern', umkreis_km: 25, monatsbudget_eur: 500,
  staedte: [{ name: 'Regensburg', lat: 49.01, lng: 12.1 }, { name: 'Passau', lat: 48.56, lng: 13.43 }],
}
const creative = { id: '1234567890ab', motiv: 'lifestyle', hook: 'Dein Laden?', haupttext: 'Wir helfen dir.', ueberschrift: 'Jetzt prüfen', cta_typ: 'LEARN_MORE' }

describe('Meta-Payloads', () => {
  it('alles startet pausiert', () => {
    expect(kampagnePayload(region, cfg).status).toBe('PAUSED')
    expect(anzeigengruppePayload(region, 'c1', cfg).status).toBe('PAUSED')
    expect(anzeigePayload('a', 's', 'c').status).toBe('PAUSED')
  })

  it('Ziel Leads, Budget auf der Anzeigengruppe', () => {
    const k = kampagnePayload(region, cfg)
    expect(k.objective).toBe('OUTCOME_LEADS')
    expect(k.special_ad_categories).toEqual([])
    const a = anzeigengruppePayload(region, 'c1', cfg)
    expect(a.daily_budget).toBe(1612)
    expect(a.promoted_object).toEqual({ pixel_id: 'px', custom_event_type: 'LEAD' })
    expect(a.dsa_beneficiary).toBe('immergrün Franchise GmbH')
  })

  it('Umkreis je Stadt in km', () => {
    const g = zielgebiet(region)
    expect(g.custom_locations).toHaveLength(2)
    expect(g.custom_locations[0]).toEqual({ latitude: 49.01, longitude: 12.1, radius: 25, distance_unit: 'kilometer' })
  })

  it('fehlende Koordinaten werfen', () => {
    expect(() => zielgebiet({ ...region, staedte: [{ name: 'X' }] })).toThrow(/Koordinaten/)
    expect(() => zielgebiet({ ...region, staedte: [] })).toThrow(/keine Städte/)
  })

  it('Sonderkategorie entfernt Alters-Targeting', () => {
    const a = anzeigengruppePayload(region, 'c1', { ...cfg, sonderkategorie: 'EMPLOYMENT' })
    expect(a.targeting.age_min).toBeUndefined()
    expect(kampagnePayload(region, { ...cfg, sonderkategorie: 'EMPLOYMENT' }).special_ad_categories).toEqual(['EMPLOYMENT'])
  })

  it('Link mit UTM-Parametern', () => {
    const c = bildCreativePayload(creative, region, 'hash1', cfg)
    const link = new URL(c.object_story_spec.link_data.link)
    expect(link.searchParams.get('utm_campaign')).toBe('ostbayern')
    expect(link.searchParams.get('utm_content')).toBe('lifestyle')
    expect(link.searchParams.get('utm_term')).toBe(creative.id)
    expect(c.object_story_spec.link_data.message).toBe('Dein Laden?\n\nWir helfen dir.')
    expect(c.object_story_spec.instagram_user_id).toBe('ig')
  })

  it('wählt 4:5 vor 1:1', () => {
    expect(waehleBild([{ typ: 'bild', format: '1:1', url: 'a' }, { typ: 'bild', format: '4:5', url: 'b' }]).url).toBe('b')
    expect(waehleBild([{ typ: 'video', format: '9:16', url: 'v' }])).toBeNull()
  })

  it('zählt Leads', () => {
    expect(leadsAusAktionen([{ action_type: 'link_click', value: '9' }, { action_type: 'lead', value: '3' }])).toBe(3)
    expect(leadsAusAktionen([{ action_type: 'offsite_conversion.fb_pixel_lead', value: '2' }])).toBe(2)
    expect(leadsAusAktionen(undefined)).toBe(0)
  })
})
