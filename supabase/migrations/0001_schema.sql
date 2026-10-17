-- IG Partner-Ads: Datenmodell Phase 1
-- Läuft in der bestehenden Supabase-Instanz von IG-Wissen. Alle Tabellen
-- tragen das Präfix ads_, damit sie sich nicht mit IG-Wissen mischen und
-- kein zusätzliches Schema freigegeben werden muss.

create type ads_rolle as enum ('admin', 'expansion', 'viewer');
create type ads_motiv as enum ('gruendergeschichte', 'zahlen_sicherheit', 'lifestyle', 'echter_partner');
create type ads_creative_status as enum ('entwurf', 'freigegeben', 'abgelehnt', 'archiviert');
create type ads_kampagnen_status as enum ('entwurf', 'wird_angelegt', 'pausiert', 'live', 'fehler');
create type ads_freigabe_art as enum ('creative', 'kampagne_live', 'kampagne_pause', 'budget', 'obergrenze');
create type ads_entscheidung as enum ('freigegeben', 'abgelehnt');
create type ads_job_art as enum ('texte', 'medien', 'kampagne_anlegen');
create type ads_job_status as enum ('wartet', 'laeuft', 'fertig', 'fehler');

-- Nutzer der App. Wer hier nicht steht, sieht nichts. Rolle admin = Mark,
-- expansion = Rick, viewer = weitere Teammitglieder (nur lesen).
create table ads_users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  name        text,
  rolle       ads_rolle not null default 'viewer',
  created_at  timestamptz not null default now()
);

-- Genau eine Zeile. Gesamt-Obergrenze legt nur admin fest.
create table ads_einstellungen (
  id                      boolean primary key default true check (id),
  gesamt_obergrenze_eur   numeric(10,2) not null default 1500 check (gesamt_obergrenze_eur >= 0),
  gute_lead_schwelle      int not null default 70 check (gute_lead_schwelle between 0 and 100),
  landingpage_url         text not null default 'https://erfolgscheck.mein-immergruen.de',
  aktualisiert_am         timestamptz not null default now(),
  aktualisiert_von        uuid
);
insert into ads_einstellungen (id) values (true);

create table ads_regions (
  id                uuid primary key default gen_random_uuid(),
  name              text not null unique,
  -- Kurzname für utm_campaign, nur a-z, 0-9 und Bindestrich
  slug              text not null unique check (slug ~ '^[a-z0-9-]+$'),
  -- [{ "name": "Regensburg", "lat": 49.01, "lng": 12.10 }]
  staedte           jsonb not null default '[]'::jsonb check (jsonb_typeof(staedte) = 'array'),
  umkreis_km        int not null default 25 check (umkreis_km between 1 and 80),
  monatsbudget_eur  numeric(10,2) not null default 0 check (monatsbudget_eur >= 0),
  obergrenze_eur    numeric(10,2) not null check (obergrenze_eur >= 0),
  aktiv             boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  constraint budget_unter_obergrenze check (monatsbudget_eur <= obergrenze_eur)
);

create table ads_creatives (
  id                uuid primary key default gen_random_uuid(),
  region_id         uuid not null references ads_regions(id) on delete cascade,
  motiv             ads_motiv not null,
  hook              text not null default '',
  haupttext         text not null default '',
  ueberschrift      text not null default '',
  cta_typ           text not null default 'LEARN_MORE'
                    check (cta_typ in ('LEARN_MORE', 'SIGN_UP', 'APPLY_NOW', 'GET_QUOTE', 'CONTACT_US')),
  bild_idee         text not null default '',
  -- [{ "format": "4:5", "typ": "bild" | "video", "url": "...", "pfad": "..." }]
  medien            jsonb not null default '[]'::jsonb check (jsonb_typeof(medien) = 'array'),
  -- Ergebnis der automatischen Markenprüfung { verstoesse: [], hinweise: [] }
  markencheck       jsonb not null default '{}'::jsonb,
  status            ads_creative_status not null default 'entwurf',
  erstellt_von      uuid,
  freigegeben_von   uuid,
  freigegeben_am    timestamptz,
  meta_creative_id  text,
  meta_ad_id        text unique,
  meta_video_ad_id  text unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on ads_creatives (region_id, status);

-- Eine Kampagne pro Region. Zeilen schreiben nur die Server-Funktionen.
create table ads_campaigns (
  id                uuid primary key default gen_random_uuid(),
  region_id         uuid not null unique references ads_regions(id) on delete cascade,
  meta_campaign_id  text unique,
  meta_adset_id     text unique,
  status            ads_kampagnen_status not null default 'entwurf',
  tagesbudget_cent  int check (tagesbudget_cent >= 0),
  letzter_fehler    text,
  live_seit         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Jede menschliche Entscheidung. Nur anhängen, nie ändern.
create table ads_approvals (
  id          uuid primary key default gen_random_uuid(),
  art         ads_freigabe_art not null,
  objekt_id   uuid not null,
  entscheidung ads_entscheidung not null,
  kommentar   text,
  details     jsonb not null default '{}'::jsonb,
  user_id     uuid not null,
  created_at  timestamptz not null default now()
);
create index on ads_approvals (objekt_id, created_at desc);

-- Leads aus dem Erfolgscheck (Phase 2 füllt diese Tabelle).
create table ads_leads (
  id              uuid primary key default gen_random_uuid(),
  externe_id      text unique,
  region_id       uuid references ads_regions(id) on delete set null,
  creative_id     uuid references ads_creatives(id) on delete set null,
  motiv           ads_motiv,
  utm_campaign    text,
  utm_content     text,
  score           int check (score between 0 and 100),
  stufe           text check (stufe in ('niedrig', 'mittel', 'hoch')),
  meta_gemeldet_am timestamptz,
  erstellt_am     timestamptz not null default now()
);
create index on ads_leads (region_id, erstellt_am);

create table ads_metrics_daily (
  datum         date not null,
  meta_ad_id    text not null,
  region_id     uuid references ads_regions(id) on delete set null,
  creative_id   uuid references ads_creatives(id) on delete set null,
  ausgaben_eur  numeric(10,2) not null default 0,
  impressionen  int not null default 0,
  klicks        int not null default 0,
  leads_meta    int not null default 0,
  abgeholt_am   timestamptz not null default now(),
  primary key (datum, meta_ad_id)
);
create index on ads_metrics_daily (region_id, datum);

-- Lange Arbeiten (Texte, Bilder, Kampagne anlegen) laufen im Hintergrund.
create table ads_jobs (
  id          uuid primary key default gen_random_uuid(),
  art         ads_job_art not null,
  status      ads_job_status not null default 'wartet',
  eingabe     jsonb not null default '{}'::jsonb,
  ergebnis    jsonb,
  fehler      text,
  erstellt_von uuid not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Was die App selbst getan hat (z. B. Schutzpause bei erreichtem Budget).
create table ads_protokoll (
  id          bigserial primary key,
  ereignis    text not null,
  region_id   uuid references ads_regions(id) on delete set null,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
