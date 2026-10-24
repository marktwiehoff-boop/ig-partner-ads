-- Menschen für den Ende-zu-Ende-Lauf: Mark (admin), Rick (expansion), Team (viewer).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'mark@test.de'),
  ('00000000-0000-0000-0000-00000000000e', 'rick@test.de'),
  ('00000000-0000-0000-0000-00000000000b', 'team@test.de');
insert into ads_users (id, email, name, rolle) values
  ('00000000-0000-0000-0000-00000000000a', 'mark@test.de', 'Mark', 'admin'),
  ('00000000-0000-0000-0000-00000000000e', 'rick@test.de', 'Rick', 'expansion'),
  ('00000000-0000-0000-0000-00000000000b', 'team@test.de', 'Team', 'viewer');
-- Ein hochgeladenes Store-Foto als Bildvorlage (die Datei liefert der Fake-Server).
insert into ads_referenzbilder (titel, art, pfad, url, aktiv, erstellt_von) values
  ('Store Hamburg Theke', 'store', 'referenzen/store-hamburg.jpg', :'vorlage_url', true, '00000000-0000-0000-0000-00000000000a');
