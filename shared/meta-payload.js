// Baut die Anfragen an die Meta Marketing API. Reine Funktionen ohne
// Netzwerk, damit sich jede Regel testen lässt. Grundsatz: Alles, was hier
// angelegt wird, startet mit status PAUSED.

import { tagesbudgetCent } from './budget.js'
import { zielLink } from './utm.js'
import { MOTIVE } from './motive.js'

export const PAUSIERT = 'PAUSED'

export function kampagnePayload(region, cfg) {
  return {
    name: `IG Partner-Ads | ${region.name}`,
    objective: 'OUTCOME_LEADS',
    buying_type: 'AUCTION',
    status: PAUSIERT,
    special_ad_categories: cfg.sonderkategorie ? [cfg.sonderkategorie] : [],
    special_ad_category_country: cfg.sonderkategorie ? ['DE'] : undefined,
    // Budget liegt auf der Anzeigengruppe, nicht auf der Kampagne
    is_adset_budget_sharing_enabled: false,
  }
}

export function zielgebiet(region) {
  const staedte = Array.isArray(region.staedte) ? region.staedte : []
  if (staedte.length === 0) throw new Error(`Region ${region.name} hat keine Städte.`)
  return {
    custom_locations: staedte.map((s) => {
      if (typeof s.lat !== 'number' || typeof s.lng !== 'number') {
        throw new Error(`Für ${s.name} fehlen die Koordinaten.`)
      }
      return { latitude: s.lat, longitude: s.lng, radius: region.umkreis_km, distance_unit: 'kilometer' }
    }),
    location_types: ['home', 'recent'],
  }
}

export function anzeigengruppePayload(region, campaignId, cfg) {
  const targeting = {
    geo_locations: zielgebiet(region),
    targeting_automation: { advantage_audience: 0 },
  }
  // In Sonderkategorien (z. B. EMPLOYMENT) verbietet Meta Alters-Targeting.
  if (!cfg.sonderkategorie) {
    targeting.age_min = 25
    targeting.age_max = 65
  }
  return {
    name: `${region.name} | Umkreis ${region.umkreis_km} km`,
    campaign_id: campaignId,
    status: PAUSIERT,
    daily_budget: tagesbudgetCent(region.monatsbudget_eur),
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    destination_type: 'WEBSITE',
    promoted_object: { pixel_id: cfg.pixelId, custom_event_type: 'LEAD' },
    targeting,
    // EU-Pflicht (Digital Services Act)
    dsa_beneficiary: cfg.dsaBeguenstigter,
    dsa_payor: cfg.dsaBeguenstigter,
  }
}

export function anzeigenText(creative) {
  return [creative.hook, creative.haupttext].filter(Boolean).join('\n\n')
}

/** Creative für eine Bildanzeige (Feed, Stories, Reels, Platzierung automatisch). */
export function bildCreativePayload(creative, region, imageHash, cfg) {
  const link = zielLink(cfg.landingpageUrl, { regionSlug: region.slug, motiv: creative.motiv, creativeId: creative.id })
  return {
    name: `${region.name} | ${MOTIVE[creative.motiv]?.titel || creative.motiv} | ${creative.id.slice(0, 8)}`,
    object_story_spec: {
      page_id: cfg.pageId,
      ...(cfg.instagramUserId ? { instagram_user_id: cfg.instagramUserId } : {}),
      link_data: {
        link,
        message: anzeigenText(creative),
        name: creative.ueberschrift,
        image_hash: imageHash,
        call_to_action: { type: creative.cta_typ, value: { link } },
      },
    },
  }
}

/** Creative für eine Videoanzeige (Clip im Format 9:16). */
export function videoCreativePayload(creative, region, videoId, vorschaubildUrl, cfg) {
  const link = zielLink(cfg.landingpageUrl, { regionSlug: region.slug, motiv: creative.motiv, creativeId: creative.id })
  return {
    name: `${region.name} | ${MOTIVE[creative.motiv]?.titel || creative.motiv} | Clip | ${creative.id.slice(0, 8)}`,
    object_story_spec: {
      page_id: cfg.pageId,
      ...(cfg.instagramUserId ? { instagram_user_id: cfg.instagramUserId } : {}),
      video_data: {
        video_id: videoId,
        image_url: vorschaubildUrl,
        message: anzeigenText(creative),
        title: creative.ueberschrift,
        call_to_action: { type: creative.cta_typ, value: { link } },
      },
    },
  }
}

export function anzeigePayload(name, adsetId, creativeId) {
  return { name, adset_id: adsetId, creative: { creative_id: creativeId }, status: PAUSIERT }
}

/** Welches Bild nehmen wir für die Bildanzeige? 4:5 ist für den Feed am besten. */
export function waehleBild(medien) {
  const bilder = (medien || []).filter((m) => m.typ === 'bild' && m.url)
  return bilder.find((m) => m.format === '4:5') || bilder.find((m) => m.format === '1:1') || bilder[0] || null
}

export function waehleVideo(medien) {
  return (medien || []).find((m) => m.typ === 'video' && m.url) || null
}

/** Leads aus den Meta-Aktionen. Website-Leads melden sich als "lead" oder Pixel-Lead. */
export function leadsAusAktionen(actions) {
  if (!Array.isArray(actions)) return 0
  const wert = (typ) => Number(actions.find((a) => a.action_type === typ)?.value || 0)
  return wert('lead') || wert('offsite_conversion.fb_pixel_lead') || wert('onsite_conversion.lead_grouped')
}
