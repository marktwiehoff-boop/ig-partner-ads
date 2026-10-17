-- Einmalig im Supabase SQL-Editor ausführen, NACHDEM du dich einmal in der
-- App angemeldet hast. E-Mail-Adresse anpassen.
insert into ads_users (id, email, name, rolle)
select id, email, 'Mark', 'admin' from auth.users where lower(email) = lower('DEINE-EMAIL@mein-immergruen.de')
on conflict (id) do update set rolle = 'admin';
