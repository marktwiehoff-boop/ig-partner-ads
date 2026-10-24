-- Autopilot: Ein Mensch startet die Partnersuche für eine Region mit Budget
-- und Obergrenze. Das ist die menschliche Freigabe. Alles danach (Texte,
-- Prüfung, Bilder, Freigabe, Kampagne, Live, Budget an Meta, Neustart im
-- neuen Monat) erledigt die App im Rahmen dieses Budgets selbst.
-- Obergrenzen bleiben hart (ads_regions_pruefen). Mehr Budget gibt es nur,
-- wenn ein Mensch das Monatsbudget ändert (wird protokolliert).

alter table ads_regions
  add column autopilot        boolean not null default false,
  add column autopilot_von    uuid,
  add column autopilot_seit   timestamptz,
  add column freigabe_modus   text not null default 'automatisch'
    check (freigabe_modus in ('automatisch', 'manuell'));

grant update (autopilot, freigabe_modus) on ads_regions to authenticated;

-- Ist die Anzeige bei Meta gerade aktiv? Setzt nur der Server.
alter table ads_creatives add column meta_aktiv boolean not null default false;

create or replace function ads_autopilot_pruefen()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not new.aktiv then
    new.autopilot := false;
  end if;

  if new.autopilot and not old.autopilot then
    if auth.uid() is null then
      raise exception 'Die Partnersuche startet nur ein Mensch.' using errcode = '42501';
    end if;
    if new.monatsbudget_eur <= 0 then
      raise exception 'Zum Starten braucht die Region ein Monatsbudget über 0 €.' using errcode = '23514';
    end if;
    if jsonb_array_length(new.staedte) = 0 then
      raise exception 'Zum Starten braucht die Region mindestens eine Stadt.' using errcode = '23514';
    end if;
    new.autopilot_von := auth.uid();
    new.autopilot_seit := now();
    insert into ads_approvals (art, objekt_id, entscheidung, kommentar, details, user_id)
    values ('kampagne_live', new.id, 'freigegeben', 'Partnersuche gestartet',
      jsonb_build_object('autopilot', true, 'monatsbudget_eur', new.monatsbudget_eur,
        'obergrenze_eur', new.obergrenze_eur, 'freigabe_modus', new.freigabe_modus),
      auth.uid());
  elsif old.autopilot and not new.autopilot then
    new.autopilot_seit := null;
    if auth.uid() is not null then
      insert into ads_approvals (art, objekt_id, entscheidung, kommentar, details, user_id)
      values ('kampagne_pause', new.id, 'freigegeben', 'Partnersuche gestoppt',
        jsonb_build_object('autopilot', false), auth.uid());
    end if;
  end if;
  return new;
end $$;

create trigger ads_autopilot_pruefen
  before update on ads_regions
  for each row execute function ads_autopilot_pruefen();

-- Automatische Freigabe: nur der Server (service_role), nur wenn die Region
-- auf Autopilot mit automatischer Freigabe steht, die Markenregeln passen,
-- ein Bild da ist und die Qualitätsprüfung bestanden wurde. Zugerechnet
-- wird die Freigabe der Person, die die Partnersuche gestartet hat.
create or replace function ads_creative_auto_freigeben(p_creative_id uuid, p_pruefung jsonb)
returns ads_creatives language plpgsql security definer set search_path = public as $$
declare
  c ads_creatives;
  r ads_regions;
  v text[];
begin
  if auth.uid() is not null then
    raise exception 'Automatisch freigeben darf nur der Server.' using errcode = '42501';
  end if;
  select * into c from ads_creatives where id = p_creative_id for update;
  if not found then
    raise exception 'Anzeige nicht gefunden.' using errcode = 'P0002';
  end if;
  select * into r from ads_regions where id = c.region_id;
  if not r.autopilot or r.freigabe_modus <> 'automatisch' or r.autopilot_von is null then
    raise exception 'Die Region steht nicht auf automatischer Freigabe.' using errcode = '42501';
  end if;
  if coalesce((p_pruefung->>'bestanden')::boolean, false) is not true then
    raise exception 'Die Qualitätsprüfung ist nicht bestanden.' using errcode = '23514';
  end if;
  v := ads_creative_verstoesse(c);
  if array_length(v, 1) > 0 then
    raise exception 'Markenregeln verletzt: %', array_to_string(v, ', ') using errcode = '23514';
  end if;
  if not exists (select 1 from jsonb_array_elements(c.medien) m where m->>'typ' = 'bild') then
    raise exception 'Es fehlt noch ein Bild.' using errcode = '23514';
  end if;
  if c.status <> 'entwurf' then
    raise exception 'Nur Entwürfe werden automatisch freigegeben.' using errcode = '23514';
  end if;

  perform set_config('ads.freigabe', 'an', true);
  update ads_creatives
     set status = 'freigegeben', freigegeben_von = r.autopilot_von, freigegeben_am = now(),
         markencheck = coalesce(markencheck, '{}'::jsonb) || jsonb_build_object('pruefung', p_pruefung)
   where id = p_creative_id
   returning * into c;
  perform set_config('ads.freigabe', '', true);

  insert into ads_approvals (art, objekt_id, entscheidung, kommentar, details, user_id)
  values ('creative', p_creative_id, 'freigegeben', 'Automatisch freigegeben (Autopilot)',
    jsonb_build_object('automatisch', true, 'pruefung', p_pruefung), r.autopilot_von);
  return c;
end $$;

revoke execute on function ads_creative_auto_freigeben(uuid, jsonb) from public, anon, authenticated;
grant execute on function ads_creative_auto_freigeben(uuid, jsonb) to service_role;

-- Lauf-Sperre: Der Autopilot läuft alle 15 Minuten. Zwei Läufe gleichzeitig
-- darf es nicht geben (sonst doppelte Texte oder Kampagnen).
create table ads_autopilot_lauf (
  id                   boolean primary key default true check (id),
  laeuft_seit          timestamptz,
  letzter_lauf         timestamptz,
  letzter_bericht      jsonb,
  letzte_optimierung   date
);
insert into ads_autopilot_lauf (id) values (true);
alter table ads_autopilot_lauf enable row level security;
create policy ads_autopilot_lauf_lesen on ads_autopilot_lauf for select to authenticated using (ads_ist_nutzer());
revoke all on ads_autopilot_lauf from anon, authenticated;
grant select on ads_autopilot_lauf to authenticated;

create or replace function ads_autopilot_sperre_holen()
returns boolean language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  if auth.uid() is not null then
    raise exception 'Nur der Server.' using errcode = '42501';
  end if;
  update ads_autopilot_lauf
     set laeuft_seit = now()
   where id and (laeuft_seit is null or laeuft_seit < now() - interval '20 minutes')
   returning true into ok;
  return coalesce(ok, false);
end $$;

create or replace function ads_autopilot_sperre_freigeben(p_bericht jsonb)
returns void language sql security definer set search_path = public as $$
  update ads_autopilot_lauf
     set laeuft_seit = null, letzter_lauf = now(), letzter_bericht = p_bericht
   where id
$$;

revoke execute on function ads_autopilot_sperre_holen() from public, anon, authenticated;
revoke execute on function ads_autopilot_sperre_freigeben(jsonb) from public, anon, authenticated;
grant execute on function ads_autopilot_sperre_holen() to service_role;
grant execute on function ads_autopilot_sperre_freigeben(jsonb) to service_role;
