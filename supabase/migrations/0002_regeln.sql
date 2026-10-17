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

  if v_inhalt_geaendert and old.meta_ad_id is not null and auth.uid() is not null then
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
    if old.status = 'freigegeben' and old.meta_ad_id is null then
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
