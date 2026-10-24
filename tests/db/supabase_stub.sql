-- Nachbau der Supabase-Grundlagen, damit die Migrationen auf einem nackten
-- Postgres getestet werden können. Nicht auf dem echten Server ausführen.
create extension if not exists pgcrypto;
do $$ begin
  create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
-- Genau wie in Supabase: erst der alte GUC, sonst der sub aus den JWT-Claims (PostgREST).
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean);
grant usage on schema public to anon, authenticated, service_role;
-- Supabase vergibt auf neue Tabellen und Funktionen pauschal alle Rechte.
-- Das bilden wir nach, damit die Migrationen genau das wieder einschränken müssen.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
-- Eine fremde Funktion wie in IG-Wissen: Partner-Ads darf ihre Rechte nicht ändern.
create or replace function public.igwissen_suche(q text) returns text language sql as $$ select q $$;
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, anon;
grant select, insert, delete on storage.objects to authenticated;
