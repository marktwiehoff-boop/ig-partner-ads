# IG Partner-Ads – Bauplan und Prompt für Claude Code

## 1. Ziel in einem Satz
Eine interne App, mit der Rick (Expansion) selbst Meta-Ads zur Franchise-Partnersuche erstellt, je Region budgetiert, freigibt und auswertet. Die App lernt aus der Qualität der Leads (Erfolgscheck), nicht aus Klicks.

## 2. Grundprinzip
- Mensch entscheidet, KI liefert: Nichts geht live und kein Budget ändert sich ohne Freigabe durch Rick.
- Meta optimiert innerhalb einer Kampagne. Unsere App steuert darüber: Budget zwischen Regionen und Motiven.
- Alle Texte und Bildideen kommen aus dem immergrün-Wissensspeicher (IG-Wissen), nicht aus generischem KI-Wissen.

## 3. Module

### A. Regionen und Budget
- Regionen anlegen: Name, Städte, Umkreis in km, Monatsbudget, Obergrenze.
- Start: Berlin, Ostbayern (Regensburg, Passau, Ingolstadt), Region Stuttgart. Je 500 € pro Monat.
- Harte Obergrenze pro Region und gesamt. Die App darf diese nie überschreiten.

### B. Content-Studio
- Texte: Claude API erzeugt Anzeigentexte (Hook, Haupttext, Überschrift, Call-to-Action) je Region und Motiv.
  Pflichtquelle: Markenstimme und Markenwissen aus IG-Wissen (Markdown im Git-Repo, Domäne 01_Marke_Branding u. a.).
- Motive (3–4 je Region): Gründergeschichte, Zahlen und Sicherheit, Lifestyle/Selbstständigkeit, echter Partner.
- Bilder/Clips: Higgsfield (Bild + kurzes Video im Format 1:1, 4:5, 9:16).
- Markenregeln fest einbauen: Farben Forest Green #084B32, Fresh Green #96C31E, Creamy #F4F1EA, kein Gelb #FAD20A. Schriften Gloock / Work Sans. Ansprache „du“, keine Semikolons, keine Gedankenstriche als Trenner.
- Rick sieht Vorschau, kann Text ändern, neu erzeugen oder freigeben.

### C. Ausspielung (Meta Marketing API)
- Pro Region eine Kampagne (Ziel: Leads), Anzeigengruppe mit Umkreis-Targeting, Anzeigen = freigegebene Motive.
- Kanäle: Facebook und Instagram (Feed, Stories, Reels), Platzierung automatisch.
- Link zur Erfolgscheck-Landingpage mit UTM-Parametern: utm_campaign=region, utm_content=motiv.
- Kampagnen starten pausiert. Aktivieren erst nach Klick auf „Live schalten“.

### D. Lead-Rückkopplung (das Herzstück)
- Erfolgscheck speichert Region und Motiv aus den UTM-Parametern zum Lead.
- Erfolgscheck-Score (0–100 %, drei Stufen) wird über die Meta Conversions API als eigenes Ereignis „QualifiedLead“ an Meta zurückgemeldet.
  So lernt Meta, ähnliche gute Interessenten zu finden.
- Später: Ricks CRM-Status (Call, Webkonferenz, Treffen, Reservierung) ebenfalls zurückspielen.

### E. Lernende Budget-Empfehlung
- Wöchentlich (n8n): Kosten pro Lead und Kosten pro gutem Lead je Region und Motiv berechnen.
- Regeln für Version 1 (einfach und nachvollziehbar):
  - Motiv mit deutlich schlechteren Kosten pro gutem Lead nach mind. 14 Tagen pausieren vorschlagen.
  - Budget um max. 20 % pro Woche von der schwächsten zur stärksten Region verschieben vorschlagen.
  - Keine Entscheidung bei zu wenigen Daten (z. B. unter 10 Leads in der Region).
- Rick erhält den Vorschlag mit Begründung und klickt „freigeben“ oder „ablehnen“.

### F. Dashboard
- Kennzahlen je Region und Motiv: Ausgaben, Leads, gute Leads, Kosten pro gutem Lead, Termine.
- Wochenbericht per E-Mail an Rick und Mark.

## 4. Rollen
- Rick: alles bedienen, freigeben, Budget im Rahmen ändern.
- Mark: Gesamtbudget und Obergrenzen festlegen, alles sehen.
- Weitere Teammitglieder: nur lesen.

## 5. Technik
- Datenbank und Login: Supabase (bestehend auf dem Hostinger-Server).
- Automationen und Wochenlauf: n8n (bestehend auf dem Hostinger-Server).
- Oberfläche: Web-App (React), Hosting auf Netlify oder auf dem Server.
- Schnittstellen: Meta Marketing API, Meta Conversions API, Claude API, Higgsfield API, IG-Wissen-Repo.
- Zugangsdaten nur als Umgebungsvariablen/Secrets, nie im Code.

## 6. Voraussetzungen (vorab klären)
- Verifizierter Meta Business Manager, Werbekonto, Facebook-Seite, Instagram-Konto.
- Meta-App mit Zugriff auf die Marketing API (Systemnutzer-Token).
- Meta-Pixel/Conversions API auf der Erfolgscheck-Landingpage.
- Datenschutz: Einwilligung (Cookie-Banner) und Datenschutzerklärung der Landingpage prüfen lassen.

## 7. Bauphasen
1. Phase 1 (MVP): Regionen, Content-Studio (Texte + Bilder), manuelle Freigabe, Kampagnen pausiert anlegen, Dashboard mit Meta-Zahlen.
2. Phase 2: UTM-Zuordnung im Erfolgscheck, QualifiedLead an Meta, Kosten pro gutem Lead.
3. Phase 3: Wöchentliche Budget-Empfehlung mit Freigabe, Wochenbericht.
4. Phase 4: CRM-Status zurückspielen, weitere Kanäle (z. B. TikTok, LinkedIn).

---

## 8. Prompt für Claude Code (zum Kopieren)

```
Du baust für die immergrün Franchise GmbH die interne Web-App "IG Partner-Ads".
Lies zuerst die Datei ig-partner-ads-bauplan.md vollständig. Sie ist die verbindliche Vorgabe.

Ziel: Unser Expansionsleiter Rick erstellt, budgetiert, gibt frei und wertet Meta-Ads
zur Franchise-Partnersuche selbst aus. Die App lernt aus der Lead-Qualität (Erfolgscheck-Score).

Starte mit Phase 1 (MVP):
1. Supabase-Datenmodell: regions, creatives, campaigns, approvals, leads, metrics_daily, users (Rollen: admin, expansion, viewer).
2. React-Oberfläche: Regionen verwalten, Content-Studio, Freigabe-Liste, Dashboard.
3. Content-Studio: Texte über die Claude API. Lade als Kontext immer die Markenstimme und das Markenwissen
   aus dem IG-Wissen-Repo. Halte die Markenregeln aus Abschnitt 3B strikt ein. Bilder/Clips über die Higgsfield API.
4. Meta Marketing API: Pro Region eine Lead-Kampagne mit Umkreis-Targeting anlegen, immer PAUSIERT.
   Live schalten nur nach Klick durch einen Nutzer mit Rolle admin oder expansion.
5. Tägliches Abholen der Meta-Kennzahlen in metrics_daily (n8n-Workflow oder Edge Function).

Harte Regeln:
- Niemals Budget erhöhen, Kampagnen aktivieren oder Obergrenzen überschreiten ohne Freigabe eines Menschen.
- Alle Schlüssel als Secrets, nie im Code.
- Oberfläche auf Deutsch, einfach, mobil nutzbar. Farben und Schriften laut Abschnitt 3B.

Vorgehen: Mach mir zuerst einen kurzen Umsetzungsplan mit Dateistruktur und frag nach,
welche Zugangsdaten (Meta, Claude, Higgsfield, Supabase) du brauchst. Dann bau Schritt für Schritt
und teste jeden Schritt, bevor du weitermachst. Erkläre mir Eingaben im Terminal genau Schritt für Schritt.
```
