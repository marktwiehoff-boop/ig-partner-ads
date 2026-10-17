# IG Partner-Ads

Interne App der immergrün Franchise GmbH. Rick (Expansion) erstellt, budgetiert, gibt frei und wertet Meta-Ads zur Franchise-Partnersuche aus. Grundlage ist [`docs/ig-partner-ads-bauplan.md`](docs/ig-partner-ads-bauplan.md) (Phase 1 / MVP).

**Grundsatz:** Mensch entscheidet, KI liefert. Nichts geht live und kein Budget steigt ohne Klick eines Menschen mit Rolle `admin` oder `expansion`.

## Was Phase 1 kann

| Bereich | Was passiert |
|---|---|
| Regionen | Städte mit Umkreis (km), Monatsbudget, Obergrenze. Start: Berlin, Ostbayern, Region Stuttgart mit je 500 € |
| Content-Studio | Claude schreibt Hook, Haupttext, Überschrift und Knopf je Motiv. Kontext ist immer IG-Wissen (`content/01_Marke_Branding`, `content/03_Partner_Expansion`). Higgsfield erzeugt Bilder 1:1, 4:5, 9:16 und optional einen Clip 9:16 |
| Markenregeln | du-Ansprache, keine Semikolons, keine Gedankenstriche, kein Gelb. Geprüft im Browser, auf dem Server und in der Datenbank |
| Freigaben | Nur freigegebene Anzeigen mit Bild gehen zu Meta. Jede Entscheidung steht im Protokoll |
| Meta | Je Region eine Lead-Kampagne mit Umkreis-Targeting, Facebook und Instagram, Platzierung automatisch. **Alles startet pausiert.** Live schalten nur mit Häkchen und Klick |
| Kennzahlen | Jeden Morgen um 05:15 UTC holt die App die Meta-Zahlen der letzten 3 Tage in `ads_metrics_daily` |
| Schutz | Tagesbudget = Monatsbudget / 31. Droht ein Tag die Obergrenze zu reißen, pausiert die App die Kampagne (Pausieren senkt Kosten, das darf sie allein) |

## Rollen

| Rolle | Wer | Darf |
|---|---|---|
| admin | Mark | alles, dazu Obergrenzen, Gesamt-Obergrenze und Nutzer |
| expansion | Rick | bedienen, freigeben, live schalten, Budget im Rahmen ändern |
| viewer | Team | nur lesen |

## Einrichtung Schritt für Schritt

Du brauchst kein Terminal. Alles läuft über Weboberflächen. **Schlüssel nie in Chats oder Dateien kopieren, nur in Netlify.**

### 1. Datenbank (Supabase, bestehende IG-Wissen-Instanz)

1. Öffne Supabase Studio deiner Instanz auf dem Hostinger-Server.
2. Links auf **SQL Editor** klicken, dann **New query**.
3. Öffne im GitHub-Repo die Datei `supabase/einrichtung-komplett.sql`, klicke auf **Raw**, markiere alles (Strg+A), kopiere es (Strg+C), füge es im SQL Editor ein (Strg+V) und klicke **Run**. Es muss „Success. No rows returned“ erscheinen. Die Datei läuft ganz oder gar nicht.
4. Prüfen: Links auf **Table Editor**. Dort stehen jetzt Tabellen, die mit `ads_` beginnen. In `ads_regions` stehen Berlin, Ostbayern und Region Stuttgart.
5. Links auf **Authentication**, dann **URL Configuration**. Trage die Netlify-Adresse der App (aus Schritt 2) unter **Redirect URLs** ein. Bei selbst gehostetem Supabase steht das in der Server-Datei `.env` als `ADDITIONAL_REDIRECT_URLS`.

### 2. Netlify

1. Auf app.netlify.com: **Add new site**, dann **Import an existing project**, dann **GitHub**, Repo `ig-partner-ads` wählen.
2. Build-Einstellungen übernimmt Netlify aus `netlify.toml`. Auf **Deploy** klicken.
3. **Site configuration**, dann **Environment variables**, dann **Add a variable**. Diese Variablen anlegen (Werte findest du in Schritt 3 bis 6):

| Variable | Woher |
|---|---|
| `VITE_SUPABASE_URL`, `SUPABASE_URL` | Supabase: Adresse der Instanz |
| `VITE_SUPABASE_ANON_KEY` | Supabase: anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase: service_role key (geheim) |
| `ANTHROPIC_API_KEY` | console.anthropic.com, API Keys |
| `HF_CREDENTIALS` | Higgsfield: `KEY_ID:KEY_SECRET` |
| `IGWISSEN_TOKEN` | GitHub-Token, nur Lesen auf `igwissen` |
| `META_ACCESS_TOKEN` | Systemnutzer-Token |
| `META_APP_SECRET` | Meta-App, Einstellungen, Allgemein |
| `META_AD_ACCOUNT_ID` | Werbekonto-ID (`act_…`) |
| `META_PAGE_ID` | Facebook-Seiten-ID |
| `META_INSTAGRAM_USER_ID` | Instagram-Konto-ID |
| `META_PIXEL_ID` | Pixel-ID der Erfolgscheck-Landingpage |

4. Danach **Deploys**, dann **Trigger deploy**, dann **Deploy site**. Erst mit dem neuen Build wirken die Variablen.

### 3. Meta

1. business.facebook.com, dann **Einstellungen**, dann **Nutzer**, dann **Systemnutzer**. Einen Systemnutzer „IG Partner-Ads“ anlegen (Rolle Admin).
2. **Assets zuweisen**: Werbekonto, Facebook-Seite, Instagram-Konto, Pixel.
3. **Token generieren** mit den Rechten `ads_management`, `ads_read`, `business_management`, `pages_read_engagement`, `pages_manage_ads`, `instagram_basic`. Token direkt in Netlify eintragen.
4. **Prüfen lassen:** Ob Franchise-Partnersuche bei Meta unter eine Sonderkategorie (z. B. „Beschäftigung“) fällt. Falls ja, in Netlify `META_SONDERKATEGORIE=EMPLOYMENT` setzen. Die App verzichtet dann automatisch auf Alters-Targeting.

### 4. GitHub-Token für IG-Wissen

1. github.com, dann **Settings**, dann **Developer settings**, dann **Fine-grained tokens**, dann **Generate new token**.
2. Repository access: nur `marktwiehoff-boop/igwissen`. Permissions: **Contents: Read-only**. Sonst nichts.
3. Token in Netlify als `IGWISSEN_TOKEN` eintragen.

### 5. Ersten Admin anlegen

1. App öffnen, E-Mail eingeben, Login-Link aus dem Postfach klicken. Es erscheint „Fast geschafft“.
2. Supabase **SQL Editor**: Inhalt von `supabase/erster-admin.sql` einfügen, E-Mail-Adresse anpassen, **Run**.
3. App neu laden. Unter **Nutzer** fügst du Rick (expansion) und das Team (viewer) hinzu, nachdem sie sich einmal angemeldet haben.

### 6. Erster Probelauf

1. **Studio**: Region Berlin, ein Motiv, „Texte erzeugen“. Nach etwa einer Minute erscheint ein Entwurf.
2. „Bilder erzeugen“. Danach unter **Freigaben** „Freigeben“.
3. **Regionen**: „Kampagne pausiert bei Meta anlegen“.
4. Im Meta-Werbeanzeigenmanager prüfen: Kampagne, Anzeigengruppe und Anzeige sind **pausiert**, Umkreis und Tagesbudget (16,12 €) stimmen.
5. Erst dann im **Dashboard** „Live schalten“.

## Entwickeln

```
npm install
npm run dev        # http://localhost:5650 (braucht .env nach .env.example)
npm test           # 66 Tests: Markenregeln, Budget, Meta, Claude, Higgsfield, Rechte
npm run test:db    # Migrationen und Datenbankregeln auf lokalem Postgres 16
npm run build
```

## Aufbau

| Ordner | Inhalt |
|---|---|
| `supabase/migrations/` | Tabellen `ads_*`, Rechte (RLS), Budget-Grenzen, Freigabe-Funktion, Protokoll |
| `shared/` | Regeln, die Browser und Server teilen: Markenregeln, Budget, Meta-Anfragen, UTM-Links |
| `netlify/functions/` | `texte-erzeugen-background`, `medien-erzeugen-background`, `kampagne-anlegen-background`, `kampagne-schalten`, `budget-uebertragen`, `kennzahlen-taeglich` (geplant), `kennzahlen-abholen`, `ort-suchen` |
| `src/pages/` | Dashboard, Regionen, Content-Studio, Freigaben, Nutzer, Login |
| `tests/` | Vitest (`unit`, `functions`) und Datenbank-Tests (`db`) |

## Offen für später

- Phase 2: Erfolgscheck schreibt Leads mit UTM in `ads_leads`, „QualifiedLead“ über die Conversions API. Die Anzeigen-Links tragen dafür schon `utm_campaign`, `utm_content` und `utm_term` (Anzeigen-ID).
- Phase 3: Wöchentliche Budget-Empfehlung mit Freigabe, Wochenbericht.
- Phase 4: CRM-Status (Termine) zurückspielen.
- Higgsfield-Modelle sind über `HF_BILD_MODELL` und `HF_VIDEO_MODELL` einstellbar, falls Higgsfield die Namen ändert.
