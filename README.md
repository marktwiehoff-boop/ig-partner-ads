# IG Partner-Ads

Interne App der immergrün Franchise GmbH. Rick (Expansion) erstellt, budgetiert, gibt frei und wertet Meta-Ads zur Franchise-Partnersuche aus. Grundlage ist [`docs/ig-partner-ads-bauplan.md`](docs/ig-partner-ads-bauplan.md) (Phase 1 / MVP).

**Grundsatz:** Mensch entscheidet, KI liefert. Die menschliche Entscheidung ist **ein** Klick: „Partnersuche starten“ für eine Region mit Monatsbudget und Obergrenze. Alles danach erledigt der Autopilot im Rahmen dieses Budgets. Mehr Budget gibt es nur, wenn ein Mensch das Monatsbudget ändert.

## Autopilot: So läuft die Partnersuche von allein

1. Rick trägt unter **Regionen** Städte, Umkreis und Monatsbudget ein und klickt **Partnersuche starten**. Der Dialog zeigt Budget, Tagesbudget und Obergrenze. Dieser Klick ist die Freigabe und wird protokolliert.
2. Ab dann läuft alle 15 Minuten der Autopilot (`autopilot-tick` → `autopilot-arbeit-background`) und macht je Region der Reihe nach:

| Schritt | Was passiert | Wer entscheidet |
|---|---|---|
| Texte | Claude schreibt für jedes Motiv ohne Anzeige eine Variante, nur mit IG-Wissen | App |
| Prüfung | Ein zweiter Claude-Durchlauf prüft jede Anzeige gegen das IG-Wissen: Fakten, Markenstimme, keine Versprechen, Zielgruppe, Region, Rechtliches. Fällt sie durch, wird sie abgelehnt und mit Korrekturhinweis neu geschrieben. Nach zwei Ablehnungen wartet das Motiv auf einen Menschen | App |
| Bilder | Higgsfield erzeugt 1:1, 3:4 und 9:16 mit eurer Bildvorlage | App |
| Freigabe | Modus „automatisch“: die Datenbank gibt frei, wenn Prüfung bestanden, Markenregeln sauber und Bild da. Modus „manuell“: Rick klickt unter Freigaben | App oder Rick |
| Meta | Kampagne, Anzeigengruppe mit Umkreis und Anzeigen werden pausiert angelegt | App |
| Budget | Tagesbudget bei Meta = Monatsbudget / 31, wird bei Änderung angeglichen, nie darüber | App (Wert kommt vom Menschen) |
| Live | Kampagne geht live, neue Anzeigen werden aktiviert | App (Freigabe = Start der Partnersuche) |
| Schutz | Nähert sich die Region ihrer Obergrenze, pausiert die App. Im neuen Monat geht es automatisch weiter | App |
| Lernen | Montags: Motive, die je gutem Lead mehr als doppelt so teuer sind wie das beste Motiv (ab 10 Leads in der Region, 14 Tage live, mindestens 50 € Ausgaben je Motiv), werden pausiert und durch eine neue Variante ersetzt | App |

3. Jeder Schritt steht im Dashboard unter „Was die App zuletzt selbst getan hat“. **Partnersuche stoppen** pausiert die Kampagne sofort.

**Was bleibt beim Menschen:** Region und Budget festlegen, Obergrenzen (nur admin), Partnersuche starten und stoppen, Motive nach zwei Ablehnungen, Budget zwischen Regionen verschieben, Bildvorlagen hochladen.

## Was Phase 1 kann

| Bereich | Was passiert |
|---|---|
| Regionen | Städte mit Umkreis (km), Monatsbudget, Obergrenze. Start: Berlin, Ostbayern, Region Stuttgart mit je 500 € |
| Content-Studio | Claude schreibt Hook, Haupttext, Überschrift und Knopf je Motiv. Kontext ist immer IG-Wissen (`content/01_Marke_Branding`, `content/03_Partner_Expansion`). Higgsfield erzeugt Bilder 1:1, 4:5, 9:16 und optional einen Clip 9:16 |
| Markenregeln | du-Ansprache, keine Semikolons, keine Gedankenstriche, kein Gelb. Geprüft im Browser, auf dem Server und in der Datenbank |
| Freigaben | Nur freigegebene Anzeigen mit Bild gehen zu Meta. Jede Entscheidung steht im Protokoll |
| Meta | Je Region eine Lead-Kampagne mit Umkreis-Targeting, Facebook und Instagram, Platzierung automatisch. **Alles startet pausiert.** Live schalten nur mit Häkchen und Klick |
| Kennzahlen | Jeden Morgen um 05:15 UTC holt die App die Meta-Zahlen der letzten 3 Tage in `ads_metrics_daily` |
| Lead-Rückkopplung | Der Erfolgscheck meldet jeden abgeschlossenen Check an `lead-eingang`. Die App ordnet Region, Motiv und Anzeige zu und meldet gute Leads als „QualifiedLead“ über die Conversions API an Meta |
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
5. **SQL-Nachträge laufen ab jetzt von allein.** Bei jedem Netlify-Deploy spielt `tools/migrieren.mjs` neue Dateien aus `supabase/migrations/` selbst ein (Tabelle `ads_migrationen` merkt sich den Stand, schon von Hand Eingespieltes wird erkannt). Dafür einmalig in Netlify die Variable `SUPABASE_DB_URL` anlegen:
   - Supabase: oben **Connect** klicken, Reiter **Session pooler** (nicht „Direct connection“, die ist nur IPv6), die Adresse `postgresql://postgres.…:[YOUR-PASSWORD]@aws-0-….pooler.supabase.com:5432/postgres` kopieren und `[YOUR-PASSWORD]` durch das Datenbank-Passwort ersetzen (Project Settings, Database, Reset password, falls unbekannt).
   - Netlify: **Environment variables**, **Add a variable**, Key `SUPABASE_DB_URL`, Wert die Adresse, **Scopes: Builds** (mehr braucht sie nicht), Context Production. Danach **Deploys**, **Trigger deploy**.
   - Im Deploy-Log steht dann „SQL-Nachträge eingespielt: …“ oder „Datenbank ist auf dem Stand“. Ein Fehler in einer SQL-Datei bricht den Deploy ab, die Datenbank bleibt unverändert.
   - Ohne die Variable bleibt es beim alten Weg: neue Dateien in `supabase/migrations/` einzeln im SQL Editor ausführen.
6. Links auf **Authentication**, dann **URL Configuration**. Trage die Netlify-Adresse der App (aus Schritt 2) unter **Redirect URLs** ein. Bei selbst gehostetem Supabase steht das in der Server-Datei `.env` als `ADDITIONAL_REDIRECT_URLS`.

### 2. Netlify

1. Auf app.netlify.com: **Add new site**, dann **Import an existing project**, dann **GitHub**, Repo `ig-partner-ads` wählen.
2. Build-Einstellungen übernimmt Netlify aus `netlify.toml`. Auf **Deploy** klicken.
3. **Site configuration**, dann **Environment variables**, dann **Add a variable**. Diese Variablen anlegen (Werte findest du in Schritt 3 bis 6):

| Variable | Woher |
|---|---|
| `VITE_SUPABASE_URL`, `SUPABASE_URL` | Supabase: Adresse der Instanz |
| `VITE_SUPABASE_ANON_KEY` | Supabase: anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase: service_role key (geheim) |
| `SUPABASE_DB_URL` | Session-Pooler-Adresse der Datenbank (Schritt 1.5), nur Scope **Builds**. Damit spielt der Deploy SQL-Nachträge selbst ein |
| `ANTHROPIC_API_KEY` | console.anthropic.com, API Keys |
| `HF_CREDENTIALS` | Higgsfield: `KEY_ID:KEY_SECRET` |
| `IGWISSEN_TOKEN` | GitHub-Token, nur Lesen auf `igwissen` |
| `META_ACCESS_TOKEN` | Systemnutzer-Token |
| `META_APP_SECRET` | Meta-App, Einstellungen, Allgemein |
| `META_AD_ACCOUNT_ID` | Werbekonto-ID (`act_…`) |
| `META_PAGE_ID` | Facebook-Seiten-ID |
| `META_INSTAGRAM_USER_ID` | Instagram-Konto-ID |
| `META_PIXEL_ID` | Pixel-ID der Erfolgscheck-Landingpage |
| `LEAD_WEBHOOK_SECRET` | Frei gewähltes, langes Geheimnis. Dasselbe trägt der Erfolgscheck (oder n8n) beim Melden von Leads ein |

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

Oben im **Dashboard** steht die **Bereitschaft**: Datenbank-Stand, Zeitplan, IG-Wissen, Claude, Higgsfield, Meta, Lead-Eingang und laufende Regionen, jeweils mit dem nächsten Handgriff, falls etwas fehlt. Erst wenn dort alles grün ist, läuft die Partnersuche ohne weiteres Zutun.

### 7. Lead-Eingang an den Erfolgscheck anschließen

Nach jedem abgeschlossenen Erfolgscheck schickt die Landingpage (oder ein n8n-Workflow) einen Aufruf:

```
POST https://ig-partner-ads-immergruen.netlify.app/.netlify/functions/lead-eingang
Header: x-lead-secret: <LEAD_WEBHOOK_SECRET>
Body (JSON):
{
  "externe_id": "erfolgscheck-12345",
  "email": "max@beispiel.de",
  "score": 82,
  "utm_campaign": "berlin",
  "utm_content": "gruendergeschichte",
  "utm_term": "<Anzeigen-ID aus dem Link>",
  "fbp": "<Cookie _fbp>", "fbc": "<Cookie _fbc>",
  "event_time": "2026-10-20T10:12:00Z",
  "client_ip": "…", "user_agent": "…",
  "event_source_url": "https://erfolgscheck.…"
}
```

Die Landingpage muss die UTM-Parameter aus dem Anzeigen-Link bis zum Abschluss mitführen. Leads mit Score ab der Schwelle (Standard 70, einstellbar unter Regionen) gehen als „QualifiedLead“ an Meta. Zum Testen `META_TEST_EVENT_CODE` aus dem Events Manager setzen.

## Entwickeln

```
npm install
npm run dev        # http://localhost:5650 (braucht .env nach .env.example)
npm test           # 103 Tests: Markenregeln, Budget, Meta, Claude, Higgsfield, Rechte, Autopilot-Planer
npm run test:db    # Migrationen, Datenbankregeln und das Einspiel-Werkzeug auf lokalem Postgres 16
npm run test:e2e   # Ende-zu-Ende: echtes Postgres + PostgREST, ein Klick, dann läuft alles bis "live"
npm run build
```

**Ende-zu-Ende-Lauf (`npm run test:e2e`):** startet ein lokales Postgres 16 und PostgREST (wird einmal heruntergeladen), spielt die Migrationen mit `tools/migrieren.mjs` ein und lässt den unveränderten App-Code laufen. Nur Claude, Higgsfield, Meta und GitHub sind Attrappen, die alles mitschreiben. Der Lauf zeigt mit 63 Prüfungen: Rick klickt einmal, danach entstehen Texte, Prüfung (eine erfundene Zahl wird abgelehnt und neu geschrieben), Bilder mit Store-Vorlage, Freigaben, die pausierte Meta-Kampagne mit 16,12 € Tagesbudget, die Live-Schaltung in der richtigen Reihenfolge, Budgetänderung, Lead-Rückmeldung, das wöchentliche Lernen, der Betrieb ohne Meta-Schlüssel und der Stopp. Nie klickt jemand außer Rick, und jede Freigabe ist ihm zugerechnet.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `supabase/migrations/` | Tabellen `ads_*`, Rechte (RLS), Budget-Grenzen, Freigabe-Funktion, Protokoll |
| `shared/` | Regeln, die Browser und Server teilen: Markenregeln, Budget, Meta-Anfragen, UTM-Links |
| `netlify/functions/` | `autopilot-tick` (alle 15 Min) → `autopilot-arbeit-background`, `autopilot-anstossen`, `lead-eingang`, `texte-erzeugen-background`, `medien-erzeugen-background`, `kampagne-anlegen-background`, `kampagne-schalten`, `budget-uebertragen`, `kennzahlen-taeglich` (täglich), `kennzahlen-abholen`, `ort-suchen` |
| `netlify/functions/lib/autopilot.mjs` | Planer (reine Funktion, getestet) und Ausführung der Schritte, Lauf-Sperre, Wochen-Lernen |
| `netlify/functions/lib/pruefer.mjs` | Qualitätsprüfung jeder Anzeige gegen das IG-Wissen vor der automatischen Freigabe |
| `src/pages/` | Dashboard, Regionen, Content-Studio, Freigaben, Nutzer, Login |
| `tools/migrieren.mjs` | Spielt SQL-Nachträge beim Netlify-Build ein (nur Production, nur mit `SUPABASE_DB_URL`) |
| `tests/` | Vitest (`unit`, `functions`), Datenbank-Tests (`db`) und Ende-zu-Ende-Lauf (`e2e`) |

## Offen für später

- Phase 2 ist angeschlossen (`lead-eingang`). Offen: Der Erfolgscheck muss den Aufruf senden, und die Meta-Anzeigengruppe kann später auf das Ereignis „QualifiedLead“ statt „Lead“ optimieren (Custom Conversion im Events Manager anlegen, dann `promoted_object` umstellen).
- Phase 3 teilweise: Schwache Motive werden wöchentlich automatisch pausiert. Offen: Budget zwischen Regionen verschieben (Vorschlag mit Freigabe), Wochenbericht per E-Mail.
- Phase 4: CRM-Status (Termine) zurückspielen.
- Higgsfield-Modelle sind über `HF_BILD_MODELL` und `HF_VIDEO_MODELL` einstellbar, falls Higgsfield die Namen ändert.
