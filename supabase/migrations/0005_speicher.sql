-- Ablage für erzeugte Bilder und Clips. Öffentlich lesbar, weil Meta die
-- Dateien abholen muss und Anzeigen ohnehin öffentlich sind. Schreiben dürfen
-- nur die Server-Funktionen (service_role).
insert into storage.buckets (id, name, public)
values ('ads-medien', 'ads-medien', true)
on conflict (id) do nothing;
