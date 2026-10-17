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
