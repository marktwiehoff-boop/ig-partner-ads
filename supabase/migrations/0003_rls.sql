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
