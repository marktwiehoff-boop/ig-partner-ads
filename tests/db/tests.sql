-- Datenbank-Tests für IG Partner-Ads. Jeder Fehler bricht den Lauf ab.
\set QUIET on
\o /dev/null

create or replace function t_fehler(p_sql text, p_teil text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_teil in sqlerrm) = 0 then
      raise exception 'Falscher Fehler bei [%]: % (erwartet: %)', p_sql, sqlerrm, p_teil;
    end if;
    return;
  end;
  raise exception 'Erwarteter Fehler blieb aus: [%] (erwartet: %)', p_sql, p_teil;
end $$;

create or replace function t_gleich(p_ist anyelement, p_soll anyelement, p_was text) returns void language plpgsql as $$
begin
  if p_ist is distinct from p_soll then
    raise exception 'FEHLGESCHLAGEN: % (ist: %, soll: %)', p_was, p_ist, p_soll;
  end if;
end $$;

create or replace function t_als(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), false);
end $$;
grant execute on function t_fehler(text, text), t_gleich(anyelement, anyelement, text), t_als(uuid) to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'mark@test.de'),
  ('00000000-0000-0000-0000-00000000000e', 'rick@test.de'),
  ('00000000-0000-0000-0000-00000000000b', 'team@test.de'),
  ('00000000-0000-0000-0000-00000000000f', 'fremd@test.de');
insert into ads_users (id, email, rolle) values
  ('00000000-0000-0000-0000-00000000000a', 'mark@test.de', 'admin'),
  ('00000000-0000-0000-0000-00000000000e', 'rick@test.de', 'expansion'),
  ('00000000-0000-0000-0000-00000000000b', 'team@test.de', 'viewer');

-- 1. Startregionen
select t_gleich((select count(*) from ads_regions)::int, 3, 'drei Startregionen');
select t_gleich((select sum(monatsbudget_eur) from ads_regions), 1500.00, 'Summe Startbudgets');

-- 2. Markenregeln
select t_gleich(ads_markenverstoesse('Du willst dein eigenes Ding? Starte mit uns.'), '{}'::text[], 'sauberer du-Text');
select t_gleich(ads_markenverstoesse('Du willst mehr; wir auch.'), array['Semikolon'], 'Semikolon');
select t_gleich(ads_markenverstoesse('Dein Start – unser Wissen.'), array['Gedankenstrich als Trenner'], 'Halbgeviertstrich');
select t_gleich(ads_markenverstoesse('Dein Start - unser Wissen.'), array['Gedankenstrich als Trenner'], 'Bindestrich als Trenner');
select t_gleich(ads_markenverstoesse('Dein Franchise-Start mit uns.'), '{}'::text[], 'Bindestrich im Wort erlaubt');
select t_gleich(ads_markenverstoesse('Starten Sie jetzt mit uns.'), array['Sie-Ansprache statt du', 'Keine du-Ansprache'], 'Sie-Ansprache');
select t_gleich(ads_markenverstoesse('Wir zeigen Ihnen, wie es geht. Du lernst schnell.'), array['Sie-Ansprache statt du'], 'Ihnen');
select t_gleich(ads_markenverstoesse('Ihr seid ein Team. Ihr wollt wachsen.'), '{}'::text[], 'ihr-Ansprache am Satzanfang erlaubt');
select t_gleich(ads_markenverstoesse('Wir freuen uns auf Ihre Bewerbung, du.'), array['Sie-Ansprache statt du'], 'Ihre mitten im Satz');

set role authenticated;

-- 3. Expansion ändert Budget im Rahmen, nicht darüber, nicht die Obergrenze
select t_als('00000000-0000-0000-0000-00000000000e');
update ads_regions set monatsbudget_eur = 400 where slug = 'berlin';
select t_gleich((select monatsbudget_eur from ads_regions where slug = 'berlin'), 400.00, 'Expansion senkt Budget');
select t_fehler($$update ads_regions set monatsbudget_eur = 600 where slug = 'berlin'$$, 'über der Obergrenze');
select t_fehler($$update ads_regions set obergrenze_eur = 900 where slug = 'berlin'$$, 'nur ein Admin');
select t_fehler($$insert into ads_regions (name, slug, obergrenze_eur) values ('X', 'x', 10)$$, 'nur ein Admin');
update ads_einstellungen set gesamt_obergrenze_eur = 9999 where id;
select t_gleich((select gesamt_obergrenze_eur from ads_einstellungen), 1500.00, 'Expansion ändert Gesamtgrenze nicht');

-- 4. Admin: Gesamt-Obergrenze greift
select t_als('00000000-0000-0000-0000-00000000000a');
update ads_regions set obergrenze_eur = 800 where slug = 'berlin';
select t_fehler($$update ads_regions set monatsbudget_eur = 700 where slug = 'berlin'$$, 'Gesamt-Obergrenze');
update ads_einstellungen set gesamt_obergrenze_eur = 1800 where id;
update ads_regions set monatsbudget_eur = 700 where slug = 'berlin';
select t_gleich((select monatsbudget_eur from ads_regions where slug = 'berlin'), 700.00, 'Admin hebt Budget nach höherer Gesamtgrenze');
select t_fehler($$update ads_einstellungen set gesamt_obergrenze_eur = 1000 where id$$, 'unter der Summe');
select t_fehler($$update ads_regions set obergrenze_eur = 600 where slug = 'berlin'$$, 'über der Obergrenze');

-- 5. Viewer und Fremde
select t_als('00000000-0000-0000-0000-00000000000b');
update ads_regions set monatsbudget_eur = 1 where slug = 'stuttgart';
select t_gleich((select monatsbudget_eur from ads_regions where slug = 'stuttgart'), 500.00, 'Viewer kann nichts ändern');
select t_gleich((select count(*) from ads_regions)::int, 3, 'Viewer sieht Regionen');
select t_fehler($$insert into ads_creatives (region_id, motiv) select id, 'lifestyle' from ads_regions limit 1$$, 'row-level security');
select t_als('00000000-0000-0000-0000-00000000000f');
select t_gleich((select count(*) from ads_regions)::int, 0, 'Fremde sehen nichts');
select t_als(null);
select t_gleich((select count(*) from ads_regions)::int, 0, 'Ohne Login sieht man nichts');

-- 6. Creative-Freigabe
select t_als('00000000-0000-0000-0000-00000000000e');
insert into ads_creatives (region_id, motiv, hook, haupttext, ueberschrift, bild_idee, erstellt_von)
select id, 'gruendergeschichte', 'Starten Sie durch.', 'Wir begleiten Sie.', 'Jetzt starten', 'Frische Bowl', auth.uid()
  from ads_regions where slug = 'berlin';
select t_gleich((select jsonb_array_length(markencheck->'verstoesse') > 0 from ads_creatives limit 1), true, 'Markencheck findet Sie-Ansprache');
select t_fehler($$select ads_creative_entscheiden((select id from ads_creatives limit 1), 'freigegeben')$$, 'Markenregeln verletzt');
update ads_creatives set hook = 'Dein eigener Laden?', haupttext = 'Wir begleiten dich vom ersten Tag an.';
select t_gleich((select markencheck->'verstoesse' from ads_creatives limit 1), '[]'::jsonb, 'Markencheck nach Korrektur leer');
select t_fehler($$select ads_creative_entscheiden((select id from ads_creatives limit 1), 'freigegeben')$$, 'Bild');
select t_fehler($$update ads_creatives set status = 'freigegeben'$$, 'Freigabe-Knopf');
update ads_creatives set medien = '[{"format":"4:5","typ":"bild","url":"https://x/1.jpg"}]';
select ads_creative_entscheiden((select id from ads_creatives limit 1), 'freigegeben', 'passt');
select t_gleich((select status::text from ads_creatives limit 1), 'freigegeben', 'Creative freigegeben');
select t_gleich((select user_id from ads_approvals limit 1), '00000000-0000-0000-0000-00000000000e'::uuid, 'Freigabe protokolliert mit Rick');
update ads_creatives set ueberschrift = 'Dein Start';
select t_gleich((select status::text from ads_creatives limit 1), 'entwurf', 'Änderung macht Freigabe rückgängig');
select t_fehler($$update ads_creatives set meta_ad_id = '123'$$, 'permission denied');

-- 7. Freigabe-Protokoll lässt sich nicht fälschen oder ändern
insert into ads_approvals (art, objekt_id, entscheidung, kommentar)
select 'budget', id, 'freigegeben', 'test' from ads_regions where slug = 'berlin';
select t_gleich((select user_id from ads_approvals where kommentar = 'test'), '00000000-0000-0000-0000-00000000000e'::uuid, 'user_id kommt aus dem Login');
select t_fehler($$update ads_approvals set kommentar = 'x'$$, 'permission denied');
select t_fehler($$delete from ads_approvals$$, 'permission denied');

-- 8. Viewer darf nicht freigeben, Server-Tabellen sind gesperrt
select t_als('00000000-0000-0000-0000-00000000000b');
select t_fehler($$select ads_creative_entscheiden((select id from ads_creatives limit 1), 'freigegeben')$$, 'nur Admin und Expansion');
select t_als('00000000-0000-0000-0000-00000000000e');
select t_fehler($$insert into ads_campaigns (region_id) select id from ads_regions limit 1$$, 'permission denied');
select t_fehler($$insert into ads_metrics_daily (datum, meta_ad_id) values (current_date, '1')$$, 'permission denied');
select t_fehler($$select ads_nutzer_setzen('fremd@test.de', 'admin')$$, 'Nur ein Admin');

-- 9. Admin verwaltet Nutzer
select t_als('00000000-0000-0000-0000-00000000000a');
select ads_nutzer_setzen('FREMD@test.de', 'viewer', 'Fremd');
select t_gleich((select rolle::text from ads_users where email = 'fremd@test.de'), 'viewer', 'Nutzer angelegt');
select t_fehler($$select ads_nutzer_setzen('mark@test.de', 'viewer')$$, 'nicht selbst');
select t_fehler($$select ads_nutzer_setzen('gibtsnicht@test.de', 'viewer')$$, 'noch niemand angemeldet');

-- 10. Bei Meta liegende Anzeigen sind gesperrt, Dashboard rechnet
reset role;
select t_als(null);
update ads_creatives set meta_ad_id = 'ad_1';
insert into ads_metrics_daily (datum, meta_ad_id, region_id, creative_id, ausgaben_eur, impressionen, klicks, leads_meta)
select current_date, 'ad_1', region_id, id, 120.50, 10000, 200, 6 from ads_creatives;
insert into ads_leads (region_id, motiv, score)
select id, 'gruendergeschichte', s from ads_regions, unnest(array[90, 75, 40]) s where slug = 'berlin';
set role authenticated;
select t_als('00000000-0000-0000-0000-00000000000e');
select t_fehler($$update ads_creatives set hook = 'Neu, du.'$$, 'liegt schon bei Meta');
select t_gleich((select gute_leads from ads_dashboard(current_date - 1, current_date) where motiv = 'gruendergeschichte'), 2::bigint, 'gute Leads');
select t_gleich((select kosten_pro_gutem_lead from ads_dashboard(current_date - 1, current_date) where motiv = 'gruendergeschichte'), 60.25, 'Kosten pro gutem Lead');
select t_gleich((select ausgaben_eur from ads_ausgaben_monat() limit 1), 120.50, 'Ausgaben im Monat');
select t_als('00000000-0000-0000-0000-00000000000b');
select t_gleich((select count(*) from ads_dashboard(current_date - 1, current_date))::int, 1, 'Viewer sieht Dashboard');
select t_als('00000000-0000-0000-0000-00000000000f');
select t_gleich((select count(*) from ads_dashboard(current_date - 1, current_date))::int, 1, 'Fremd (jetzt viewer) sieht Dashboard');
reset role;
