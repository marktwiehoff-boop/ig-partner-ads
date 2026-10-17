-- IG Partner-Ads: komplette Einrichtung in einem Schritt.
-- Erzeugt aus supabase/migrations/ (nicht von Hand ändern).
-- Läuft als Ganzes oder gar nicht: Bei einem Fehler wird nichts übernommen.
begin;

-- ===== 0001_schema.sql =====
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

-- ===== 0002_regeln.sql =====
-- IG Partner-Ads: Rechte, harte Grenzen und Freigabe-Regeln in der Datenbank.
-- Die App prüft dieselben Regeln auch in der Oberfläche und in den
-- Server-Funktionen. Hier ist die letzte Verteidigungslinie: Selbst ein
-- Fehler im Code kann keine Obergrenze überschreiten.

-- ---------------------------------------------------------------------------
-- Rollen-Helfer
-- ---------------------------------------------------------------------------
create or replace function ads_rolle_von(p_uid uuid)
returns ads_rolle language sql stable security definer set search_path = public as $$
  select rolle from ads_users where id = p_uid
$$;

create or replace function ads_darf_bedienen()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(ads_rolle_von(auth.uid()) in ('admin', 'expansion'), false)
$$;

create or replace function ads_ist_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(ads_rolle_von(auth.uid()) = 'admin', false)
$$;

create or replace function ads_ist_nutzer()
returns boolean language sql stable security definer set search_path = public as $$
  select ads_rolle_von(auth.uid()) is not null
$$;

-- ---------------------------------------------------------------------------
-- Markenregeln (Bauplan 3B). Gleiche Regeln wie shared/markenregeln.js.
-- ---------------------------------------------------------------------------
create or replace function ads_markenverstoesse(p_text text)
returns text[] language plpgsql immutable as $$
declare
  v text[] := '{}';
begin
  if p_text is null or btrim(p_text) = '' then
    return array['Text fehlt'];
  end if;
  if position(';' in p_text) > 0 then
    v := array_append(v, 'Semikolon');
  end if;
  if p_text ~ '[–—]' or p_text ~ '\s-\s' then
    v := array_append(v, 'Gedankenstrich als Trenner');
  end if;
  -- Sie-Ansprache: "Sie"/"Ihnen" groß geschrieben, "Ihr..." groß mitten im Satz
  if p_text ~ '\m(Sie|Ihnen)\M' or p_text ~ '[^.!?\s]\s+(Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\M' then
    v := array_append(v, 'Sie-Ansprache statt du');
  end if;
  if not (lower(p_text) ~ '\m(du|dich|dir|dein|deine|deinen|deinem|deiner|deines|ihr|euch|euer|eure|euren|eurem)\M') then
    v := array_append(v, 'Keine du-Ansprache');
  end if;
  return v;
end $$;

create or replace function ads_creative_verstoesse(c ads_creatives)
returns text[] language sql immutable as $$
  select ads_markenverstoesse(concat_ws(E'\n', c.hook, c.haupttext, c.ueberschrift))
    || case when c.bild_idee ~* '(gelb|yellow|fad20a)' then array['Gelb in der Bildidee'] else '{}'::text[] end
    || case when btrim(c.ueberschrift) = '' then array['Überschrift fehlt'] else '{}'::text[] end
$$;

-- ---------------------------------------------------------------------------
-- Regionen: Budget nie über Obergrenze, Summe nie über Gesamt-Obergrenze,
-- Obergrenze ändert nur admin.
-- ---------------------------------------------------------------------------
create or replace function ads_regions_pruefen()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_summe numeric;
  v_gesamt numeric;
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
    if (tg_op = 'INSERT' or new.obergrenze_eur is distinct from old.obergrenze_eur)
       and not ads_ist_admin() then
      raise exception 'Die Obergrenze einer Region darf nur ein Admin festlegen.'
        using errcode = '42501';
    end if;
  end if;

  if new.monatsbudget_eur > new.obergrenze_eur then
    raise exception 'Das Monatsbudget (% €) liegt über der Obergrenze der Region (% €).',
      new.monatsbudget_eur, new.obergrenze_eur using errcode = '23514';
  end if;

  select coalesce(sum(monatsbudget_eur), 0) into v_summe
    from ads_regions where aktiv and id <> new.id;
  if new.aktiv then
    v_summe := v_summe + new.monatsbudget_eur;
  end if;
  select gesamt_obergrenze_eur into v_gesamt from ads_einstellungen where id;
  if v_summe > v_gesamt then
    raise exception 'Alle Monatsbudgets zusammen (% €) lägen über der Gesamt-Obergrenze (% €).',
      v_summe, v_gesamt using errcode = '23514';
  end if;
  return new;
end $$;

create trigger ads_regions_pruefen
  before insert or update on ads_regions
  for each row execute function ads_regions_pruefen();

create or replace function ads_einstellungen_pruefen()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_summe numeric;
begin
  new.aktualisiert_am := now();
  if auth.uid() is not null then
    new.aktualisiert_von := auth.uid();
  end if;
  select coalesce(sum(monatsbudget_eur), 0) into v_summe from ads_regions where aktiv;
  if v_summe > new.gesamt_obergrenze_eur then
    raise exception 'Die Gesamt-Obergrenze (% €) läge unter der Summe der Monatsbudgets (% €). Senke zuerst die Budgets.',
      new.gesamt_obergrenze_eur, v_summe using errcode = '23514';
  end if;
  return new;
end $$;

create trigger ads_einstellungen_pruefen
  before update on ads_einstellungen
  for each row execute function ads_einstellungen_pruefen();

-- ---------------------------------------------------------------------------
-- Creatives: Freigabe nur über ads_creative_entscheiden(). Jede Änderung an
-- einem freigegebenen Text macht ihn wieder zum Entwurf. Anzeigen, die schon
-- bei Meta liegen, bleiben unverändert (neue Variante anlegen).
-- ---------------------------------------------------------------------------
create or replace function ads_creatives_pruefen()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_inhalt_geaendert boolean;
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.status = 'freigegeben' then
      raise exception 'Neue Anzeigen starten immer als Entwurf.' using errcode = '42501';
    end if;
    new.markencheck := jsonb_build_object('verstoesse', to_jsonb(ads_creative_verstoesse(new)))
      || (new.markencheck - 'verstoesse');
    return new;
  end if;

  v_inhalt_geaendert := (new.hook, new.haupttext, new.ueberschrift, new.cta_typ, new.bild_idee, new.medien)
    is distinct from (old.hook, old.haupttext, old.ueberschrift, old.cta_typ, old.bild_idee, old.medien);

  if v_inhalt_geaendert and coalesce(old.meta_ad_id, old.meta_video_ad_id) is not null and auth.uid() is not null then
    raise exception 'Diese Anzeige liegt schon bei Meta. Lege für Änderungen eine neue Variante an.'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status and new.status = 'freigegeben'
     and coalesce(current_setting('ads.freigabe', true), '') <> 'an' then
    raise exception 'Freigeben geht nur über den Freigabe-Knopf.' using errcode = '42501';
  end if;

  if v_inhalt_geaendert then
    new.markencheck := jsonb_build_object('verstoesse', to_jsonb(ads_creative_verstoesse(new)))
      || (new.markencheck - 'verstoesse');
    if old.status = 'freigegeben' and coalesce(old.meta_ad_id, old.meta_video_ad_id) is null then
      new.status := 'entwurf';
      new.freigegeben_von := null;
      new.freigegeben_am := null;
    end if;
  end if;
  return new;
end $$;

create trigger ads_creatives_pruefen
  before insert or update on ads_creatives
  for each row execute function ads_creatives_pruefen();

create or replace function ads_creative_entscheiden(
  p_creative_id uuid, p_entscheidung ads_entscheidung, p_kommentar text default null)
returns ads_creatives language plpgsql security definer set search_path = public as $$
declare
  c ads_creatives;
  v text[];
begin
  if not ads_darf_bedienen() then
    raise exception 'Freigeben dürfen nur Admin und Expansion.' using errcode = '42501';
  end if;
  select * into c from ads_creatives where id = p_creative_id for update;
  if not found then
    raise exception 'Anzeige nicht gefunden.' using errcode = 'P0002';
  end if;

  if p_entscheidung = 'freigegeben' then
    v := ads_creative_verstoesse(c);
    if array_length(v, 1) > 0 then
      raise exception 'Freigabe nicht möglich, Markenregeln verletzt: %', array_to_string(v, ', ')
        using errcode = '23514';
    end if;
    if not exists (select 1 from jsonb_array_elements(c.medien) m where m->>'typ' = 'bild') then
      raise exception 'Freigabe nicht möglich: Es fehlt noch ein Bild.' using errcode = '23514';
    end if;
    perform set_config('ads.freigabe', 'an', true);
    update ads_creatives
       set status = 'freigegeben', freigegeben_von = auth.uid(), freigegeben_am = now()
     where id = p_creative_id
     returning * into c;
    perform set_config('ads.freigabe', '', true);
  else
    update ads_creatives
       set status = 'abgelehnt', freigegeben_von = null, freigegeben_am = null
     where id = p_creative_id
     returning * into c;
  end if;

  insert into ads_approvals (art, objekt_id, entscheidung, kommentar, user_id)
  values ('creative', p_creative_id, p_entscheidung, p_kommentar, auth.uid());
  return c;
end $$;

-- ---------------------------------------------------------------------------
-- Freigabe-Protokoll: Wer entscheidet, wird immer aus dem Login genommen.
-- ---------------------------------------------------------------------------
create or replace function ads_approvals_pruefen()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  new.created_at := now();
  return new;
end $$;

create trigger ads_approvals_pruefen
  before insert on ads_approvals
  for each row execute function ads_approvals_pruefen();

-- ---------------------------------------------------------------------------
-- Nutzerverwaltung (nur admin)
-- ---------------------------------------------------------------------------
create or replace function ads_nutzer_setzen(p_email text, p_rolle ads_rolle, p_name text default null)
returns ads_users language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid;
  u ads_users;
begin
  if not ads_ist_admin() then
    raise exception 'Nur ein Admin verwaltet Nutzer.' using errcode = '42501';
  end if;
  select id into v_uid from auth.users where lower(email) = lower(btrim(p_email));
  if v_uid is null then
    raise exception 'Unter % hat sich noch niemand angemeldet. Die Person muss sich einmal mit dem Login-Link anmelden.', p_email
      using errcode = 'P0002';
  end if;
  if v_uid = auth.uid() and p_rolle <> 'admin' then
    raise exception 'Du kannst dir die Admin-Rolle nicht selbst nehmen.' using errcode = '42501';
  end if;
  insert into ads_users (id, email, name, rolle)
  values (v_uid, lower(btrim(p_email)), p_name, p_rolle)
  on conflict (id) do update set rolle = excluded.rolle, name = coalesce(excluded.name, ads_users.name)
  returning * into u;
  return u;
end $$;

-- ---------------------------------------------------------------------------
-- Dashboard: Kennzahlen je Region und Motiv im Zeitraum
-- ---------------------------------------------------------------------------
create or replace function ads_dashboard(p_von date, p_bis date)
returns table (
  region_id uuid, region_name text, motiv ads_motiv,
  ausgaben_eur numeric, impressionen bigint, klicks bigint,
  leads_meta bigint, leads bigint, gute_leads bigint,
  kosten_pro_lead numeric, kosten_pro_gutem_lead numeric
) language sql stable security invoker set search_path = public as $$
  with schwelle as (select gute_lead_schwelle s from ads_einstellungen where id),
  m as (
    select md.region_id, c.motiv,
           sum(md.ausgaben_eur) ausgaben, sum(md.impressionen) impr,
           sum(md.klicks) klicks, sum(md.leads_meta) leads_meta
      from ads_metrics_daily md
      left join ads_creatives c on c.id = md.creative_id
     where md.datum between p_von and p_bis
     group by 1, 2
  ),
  l as (
    select l.region_id, l.motiv, count(*) leads,
           count(*) filter (where l.score >= (select s from schwelle)) gute
      from ads_leads l
     where l.erstellt_am::date between p_von and p_bis
     group by 1, 2
  ),
  z as (
    select coalesce(m.region_id, l.region_id) region_id, coalesce(m.motiv, l.motiv) motiv,
           coalesce(m.ausgaben, 0) ausgaben, coalesce(m.impr, 0) impr, coalesce(m.klicks, 0) klicks,
           coalesce(m.leads_meta, 0) leads_meta, coalesce(l.leads, 0) leads, coalesce(l.gute, 0) gute
      from m full outer join l
        on coalesce(l.region_id, '00000000-0000-0000-0000-000000000000') = coalesce(m.region_id, '00000000-0000-0000-0000-000000000000')
       and coalesce(l.motiv::text, '') = coalesce(m.motiv::text, '')
  )
  select z.region_id, r.name, z.motiv, z.ausgaben, z.impr, z.klicks, z.leads_meta, z.leads, z.gute,
         case when z.leads > 0 then round(z.ausgaben / z.leads, 2) end,
         case when z.gute > 0 then round(z.ausgaben / z.gute, 2) end
    from z left join ads_regions r on r.id = z.region_id
   order by r.name nulls last, z.motiv nulls last
$$;

-- Ausgaben im laufenden Monat je Region (für Budget-Schutz und Anzeige)
create or replace function ads_ausgaben_monat(p_stichtag date default current_date)
returns table (region_id uuid, ausgaben_eur numeric)
language sql stable security invoker set search_path = public as $$
  select md.region_id, sum(md.ausgaben_eur)
    from ads_metrics_daily md
   where md.datum >= date_trunc('month', p_stichtag)::date and md.datum <= p_stichtag
   group by 1
$$;

-- ---------------------------------------------------------------------------
-- Jede menschliche Änderung an Budget oder Obergrenze landet im Protokoll.
-- ---------------------------------------------------------------------------
create or replace function ads_budget_protokollieren()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_table_name = 'ads_regions' then
    if new.monatsbudget_eur is distinct from old.monatsbudget_eur then
      insert into ads_approvals (art, objekt_id, entscheidung, details, user_id)
      values ('budget', new.id, 'freigegeben',
        jsonb_build_object('quelle', 'region', 'monatsbudget_alt_eur', old.monatsbudget_eur, 'monatsbudget_neu_eur', new.monatsbudget_eur),
        auth.uid());
    end if;
    if new.obergrenze_eur is distinct from old.obergrenze_eur then
      insert into ads_approvals (art, objekt_id, entscheidung, details, user_id)
      values ('obergrenze', new.id, 'freigegeben',
        jsonb_build_object('obergrenze_alt_eur', old.obergrenze_eur, 'obergrenze_neu_eur', new.obergrenze_eur),
        auth.uid());
    end if;
  elsif new.gesamt_obergrenze_eur is distinct from old.gesamt_obergrenze_eur then
    insert into ads_approvals (art, objekt_id, entscheidung, details, user_id)
    values ('obergrenze', '00000000-0000-0000-0000-000000000000', 'freigegeben',
      jsonb_build_object('gesamt', true, 'obergrenze_alt_eur', old.gesamt_obergrenze_eur, 'obergrenze_neu_eur', new.gesamt_obergrenze_eur),
      auth.uid());
  end if;
  return new;
end $$;

create trigger ads_regions_protokoll
  after update on ads_regions
  for each row execute function ads_budget_protokollieren();

create trigger ads_einstellungen_protokoll
  after update on ads_einstellungen
  for each row execute function ads_budget_protokollieren();

-- ===== 0003_rls.sql =====
-- IG Partner-Ads: Zugriffsregeln (Row Level Security)
-- viewer: alles lesen. expansion: bedienen. admin: zusätzlich Obergrenzen
-- und Nutzer. Kampagnen, Kennzahlen, Leads und Protokoll schreiben nur die
-- Server-Funktionen mit dem service_role-Schlüssel (der umgeht RLS).

alter table ads_users          enable row level security;
alter table ads_einstellungen  enable row level security;
alter table ads_regions        enable row level security;
alter table ads_creatives      enable row level security;
alter table ads_campaigns      enable row level security;
alter table ads_approvals      enable row level security;
alter table ads_leads          enable row level security;
alter table ads_metrics_daily  enable row level security;
alter table ads_jobs           enable row level security;
alter table ads_protokoll      enable row level security;

-- Nutzer
create policy ads_users_lesen on ads_users for select to authenticated
  using (id = auth.uid() or ads_ist_nutzer());

-- Einstellungen
create policy ads_einstellungen_lesen on ads_einstellungen for select to authenticated
  using (ads_ist_nutzer());
create policy ads_einstellungen_aendern on ads_einstellungen for update to authenticated
  using (ads_ist_admin()) with check (ads_ist_admin());

-- Regionen
create policy ads_regions_lesen on ads_regions for select to authenticated
  using (ads_ist_nutzer());
create policy ads_regions_anlegen on ads_regions for insert to authenticated
  with check (ads_ist_admin());
create policy ads_regions_aendern on ads_regions for update to authenticated
  using (ads_darf_bedienen()) with check (ads_darf_bedienen());

-- Creatives
create policy ads_creatives_lesen on ads_creatives for select to authenticated
  using (ads_ist_nutzer());
create policy ads_creatives_anlegen on ads_creatives for insert to authenticated
  with check (ads_darf_bedienen());
create policy ads_creatives_aendern on ads_creatives for update to authenticated
  using (ads_darf_bedienen()) with check (ads_darf_bedienen());

-- Nur lesen für Nutzer, schreiben nur Server
create policy ads_campaigns_lesen on ads_campaigns for select to authenticated using (ads_ist_nutzer());
create policy ads_leads_lesen on ads_leads for select to authenticated using (ads_ist_nutzer());
create policy ads_metrics_lesen on ads_metrics_daily for select to authenticated using (ads_ist_nutzer());
create policy ads_protokoll_lesen on ads_protokoll for select to authenticated using (ads_ist_nutzer());

-- Freigaben: lesen alle Nutzer, eintragen nur Bediener, nie ändern/löschen
create policy ads_approvals_lesen on ads_approvals for select to authenticated using (ads_ist_nutzer());
create policy ads_approvals_anlegen on ads_approvals for insert to authenticated
  with check (ads_darf_bedienen());

-- Jobs: Bediener legen an, alle Nutzer sehen den Fortschritt
create policy ads_jobs_lesen on ads_jobs for select to authenticated using (ads_ist_nutzer());
create policy ads_jobs_anlegen on ads_jobs for insert to authenticated
  with check (ads_darf_bedienen() and erstellt_von = auth.uid() and status = 'wartet');

-- Supabase vergibt auf neue Funktionen pauschal Rechte an anon und
-- authenticated. Erst alles entziehen, dann gezielt freigeben.
-- Nur ads_-Funktionen anfassen: Dieselbe Datenbank trägt auch IG-Wissen.
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'ads\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end $$;
revoke execute on function ads_rolle_von(uuid) from authenticated;
grant execute on function ads_ist_nutzer(), ads_darf_bedienen(), ads_ist_admin() to authenticated;

-- RPC-Rechte: anon darf nichts, angemeldete Nutzer die Lese- und
-- Freigabe-Funktionen (die prüfen ihre Rolle selbst).
revoke execute on function ads_creative_entscheiden(uuid, ads_entscheidung, text) from public, anon;
revoke execute on function ads_nutzer_setzen(text, ads_rolle, text) from public, anon;
revoke execute on function ads_dashboard(date, date) from public, anon;
revoke execute on function ads_ausgaben_monat(date) from public, anon;
grant execute on function ads_creative_entscheiden(uuid, ads_entscheidung, text) to authenticated;
grant execute on function ads_nutzer_setzen(text, ads_rolle, text) to authenticated;
grant execute on function ads_dashboard(date, date) to authenticated;
grant execute on function ads_ausgaben_monat(date) to authenticated;

-- Tabellenrechte (Supabase vergibt sie sonst pauschal; hier ausdrücklich)
-- Supabase vergibt auf neue Tabellen pauschal alle Rechte. Erst alles
-- entziehen, sonst greifen die spaltengenauen Rechte unten nicht.
revoke all on ads_users, ads_einstellungen, ads_regions, ads_creatives, ads_campaigns,
  ads_approvals, ads_leads, ads_metrics_daily, ads_jobs, ads_protokoll from anon, authenticated;
revoke all on sequence ads_protokoll_id_seq from anon, authenticated;
grant select on ads_users, ads_einstellungen, ads_regions, ads_creatives, ads_campaigns,
  ads_approvals, ads_leads, ads_metrics_daily, ads_jobs, ads_protokoll to authenticated;
-- Spaltengenau: Status-, Freigabe- und Meta-Felder setzen nur Server und RPCs
grant insert (name, slug, staedte, umkreis_km, monatsbudget_eur, obergrenze_eur, aktiv) on ads_regions to authenticated;
grant update (name, staedte, umkreis_km, monatsbudget_eur, obergrenze_eur, aktiv) on ads_regions to authenticated;
grant insert (region_id, motiv, hook, haupttext, ueberschrift, cta_typ, bild_idee, medien, erstellt_von) on ads_creatives to authenticated;
grant update (hook, haupttext, ueberschrift, cta_typ, bild_idee, medien, status) on ads_creatives to authenticated;
grant update (gesamt_obergrenze_eur, gute_lead_schwelle, landingpage_url) on ads_einstellungen to authenticated;
grant insert (art, objekt_id, entscheidung, kommentar, details) on ads_approvals to authenticated;
grant insert (art, eingabe, erstellt_von) on ads_jobs to authenticated;

-- ===== 0004_start_regionen.sql =====
-- Startregionen laut Bauplan 3A: je 500 € pro Monat. Die Obergrenzen stehen
-- vorsichtig auf demselben Wert. Mark (admin) kann sie in der App anheben.
insert into ads_regions (name, slug, staedte, umkreis_km, monatsbudget_eur, obergrenze_eur) values
  ('Berlin', 'berlin',
   '[{"name":"Berlin","lat":52.5200,"lng":13.4050}]', 25, 500, 500),
  ('Ostbayern', 'ostbayern',
   '[{"name":"Regensburg","lat":49.0134,"lng":12.1016},
     {"name":"Passau","lat":48.5665,"lng":13.4312},
     {"name":"Ingolstadt","lat":48.7665,"lng":11.4258}]', 25, 500, 500),
  ('Region Stuttgart', 'stuttgart',
   '[{"name":"Stuttgart","lat":48.7758,"lng":9.1829}]', 30, 500, 500)
on conflict (name) do nothing;

update ads_einstellungen set gesamt_obergrenze_eur = 1500 where id;

-- ===== 0005_speicher.sql =====
-- Ablage für erzeugte Bilder und Clips. Öffentlich lesbar, weil Meta die
-- Dateien abholen muss und Anzeigen ohnehin öffentlich sind. Schreiben dürfen
-- nur die Server-Funktionen (service_role).
insert into storage.buckets (id, name, public)
values ('ads-medien', 'ads-medien', true)
on conflict (id) do nothing;

commit;
