-- Bildvorlagen: echte immergrün-Fotos (Store, Produkte, Team), die Higgsfield
-- als Referenz bekommt, damit die Bilder nach immergrün aussehen.
create table ads_referenzbilder (
  id            uuid primary key default gen_random_uuid(),
  titel         text not null default '',
  art           text not null default 'store' check (art in ('store', 'produkt', 'team', 'sonstiges')),
  pfad          text not null unique check (pfad like 'referenzen/%'),
  url           text not null,
  aktiv         boolean not null default true,
  erstellt_von  uuid default auth.uid(),
  created_at    timestamptz not null default now()
);

alter table ads_referenzbilder enable row level security;
create policy ads_referenz_lesen on ads_referenzbilder for select to authenticated using (ads_ist_nutzer());
create policy ads_referenz_anlegen on ads_referenzbilder for insert to authenticated with check (ads_darf_bedienen());
create policy ads_referenz_aendern on ads_referenzbilder for update to authenticated
  using (ads_darf_bedienen()) with check (ads_darf_bedienen());
create policy ads_referenz_loeschen on ads_referenzbilder for delete to authenticated using (ads_darf_bedienen());

revoke all on ads_referenzbilder from anon, authenticated;
grant select, delete on ads_referenzbilder to authenticated;
grant insert (titel, art, pfad, url, aktiv) on ads_referenzbilder to authenticated;
grant update (titel, art, aktiv) on ads_referenzbilder to authenticated;

-- Hochladen und Löschen im Speicher nur für Bediener und nur im Ordner referenzen/
create policy ads_referenz_hochladen on storage.objects for insert to authenticated
  with check (bucket_id = 'ads-medien' and name like 'referenzen/%' and public.ads_darf_bedienen());
create policy ads_referenz_datei_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'ads-medien' and name like 'referenzen/%' and public.ads_darf_bedienen());
