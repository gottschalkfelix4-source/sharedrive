# ShareDrive: Projektprüfung und umgesetzte Verbesserungen

**Historischer Prüfbericht, ergänzt am 6. Oktober 2026:** Die unten dokumentierten
Testergebnisse beziehen sich auf die damalige Architektur mit separatem Web/nginx,
Caddy und einem Setup mit Credentialrotation. Diese Architektur wurde anschließend
vereinfacht: Ein App-Container liefert Frontend und API über HTTP aus; Zertifikate
und HTTPS übernimmt der vorhandene externe Reverse Proxy. PostgreSQL, Redis, MinIO
und ClamAV bleiben bestehen. Der Setup-Assistent prüft das lokale Token und erfasst
öffentliche URL und Admin-Konto; er ändert weder Infrastruktur-Secrets noch TLS.
Die aktuellen Betriebsanweisungen stehen in [README](../README.md) und
[Operations](operations.md). Die historischen Testzahlen belegen nicht die neue
Architektur; deren Prüfungen sind im zugehörigen Änderungsstand/CI zu verfolgen.

## Aktueller Deployment-Stand

- Ein gemeinsames veröffentlichtes App-Image:
  `ghcr.io/gottschalkfelix4-source/sharedrive:latest`; MinIO liegt unter
  `ghcr.io/gottschalkfelix4-source/sharedrive-minio:latest`.
- Alle drei produktiven Compose-Dateien verwenden fertige Registry-Images;
  Installation und Updates erfolgen mit `pull` und `up --no-build`.
- Erfolgreiche CI-Prüfungen auf `master` veröffentlichen linux/amd64-Images mit
  `latest` und `sha-<vollständiger Commit-SHA>`. Image-Overrides ermöglichen feste
  Commit-Tags oder Digests; lokale Builds bleiben als Entwicklungs-Override verfügbar.
- Fünf Dienste im vollständigen Compose-Stack; nur die App veröffentlicht Port 8088.
- Ein DockerMan-App-Template plus vier interne Infrastruktur-Dienste als Alternative.
- Zufällige Secrets und privates Setup-Token werden vor Erststart lokal erzeugt;
  erneute Vorbereitung erhält vorhandene Credentials und Daten.
- Keine eingebauten Proxy- oder Zertifikatsdienste. `TRUST_PROXY` vertraut standardmäßig
  nur Loopback; der Betreiber trägt die tatsächlich verbundene Proxy-IP/CIDR ein.
- Vorhandene Datenvolumes, Appdata und Migrationen bleiben erhalten. Alte Proxy-Container
  können als Orphans entfernt werden; `down -v` ist keine Upgrade-Anweisung.

## Historische Prüfung

Stand: 6. Oktober 2026. Geprüft wurden Backend-Routen, Authentifizierung, Datenmodell,
Upload-/Download- und Scanabläufe, Browser-Verschlüsselung, Frontend, Abhängigkeiten,
Docker-/Proxy-Konfiguration und Betriebsanleitungen. Nach der ersten Prüfung wurden
alle vorgeschlagenen Bereiche außer **S3-Storage / Providerwechsel** zur Umsetzung
freigegeben. Dieser Stand enthält die freigegebenen Änderungen und die Unraid-Integration.

## Befunde und Umsetzung

Die Nummern entsprechen den ursprünglichen Verbesserungsvorschlägen. „Umgesetzt“
beschreibt den Codezustand; die separat aufgeführten Tests bestimmen, welche Abläufe
tatsächlich ausgeführt wurden.

| Nr. | Ursprünglicher Befund | Umsetzung / Status |
| --- | --- | --- |
| 1 · hoch | Deklarierte Dateigrößen wurden übernommen; reale Bytes und Nutzerquota nicht ausreichend geprüft. | Strikte Metadatenvalidierung, sichere Ganzzahlen, genaue Part-/Objektgrößen einschließlich Verschlüsselungs-Overhead, atomare Quotareservierungen. Wiederholte Parts überschreiben idempotent; Finalisierung erfordert ein File-Token und liefert bei Wiederholung dasselbe Ergebnis. |
| 2 · hoch | Passwortgeschützte Einzel-/ZIP-Downloads fehlten im Browser die Authentifizierung; falsche Passwörter blockierten weitere Versuche. | Kurzlebige, auf Datei oder ZIP begrenzte Downloadtickets ohne Passwort in der URL; erneute Passworteingabe nach 401. Browserprüfung mit tatsächlich heruntergeladenen Fixture-Bytes. |
| 3 · hoch | Ein globaler S3-Providerwechsel entkoppelt bestehende Objektschlüssel vom bisherigen Speicher. | **Auf Wunsch ausgeschlossen.** Es gibt weiterhin keine unveränderliche Providerzuordnung pro Datei. Nicht umschalten, solange alte Transfers vom bisherigen Provider abhängen. |
| 4 · hoch | Setup-Rotation ließ Clients und Container mit alten Credentials weiterarbeiten; `.env`-Interpolation war unsicher. | Validierte Serialisierung, URL-kodierte DB-Credentials, erneuerbare JWT-/DB-/lokale MinIO-Konfiguration. Der Wizard verlangt Container-Neuerstellung und Bereitschaftsprüfung vor Adminanlage. Ein persistierter Fingerabdruck verhindert das Fortfahren mit dem alten Containerzustand. Kein Docker-Socket-Zugriff. |
| 5 · hoch | Unauthentifiziertes Erstsetup und parallele Adminanlage; Domain-Injektion in Caddy möglich. | Privates lokales Bootstrap-Token, Redis-Limits, transaktionaler Singleton-Lock, strikte DNS-Prüfung und Caddy-Validierung vor Reload. Gleichzeitige Erstadminanlage erlaubt genau einen Admin. Rollenänderungen erhalten den letzten Admin und widerrufen geänderte Sessions. |
| 6 · hoch | Jeder Containerstart verwendete `db push --accept-data-loss`; die Initialmigration war unvollständig. | Versionierte additive Migrationen und `migrate deploy`. Zeitstempel für die Initialmigration sichert die richtige Reihenfolge bei Erstinstallation. Kontrollierter Legacy-Baseline-Befehl mit Schema-/Constraintprüfung, Checksumprüfung alter `init`-Historie und ausdrücklicher Backup-Bestätigung. Frische und Legacy-Datenbank geprüft, finale Schema-Diffs leer und Seed-Daten erhalten. |
| 7 · hoch | Produktivaudit: Backend 1 kritisch / 4 hoch / 9 mittel, Frontend 1 hoch / 2 mittel; Node 20. | Node 24, aktualisierte direkte/transitive Pakete und Lockfiles, entfernte ungenutzte Pakete, Prisma 6.12.0. Aktuell keine hohen/kritischen Produktivbefunde; verbleibende Befunde siehe unten. |
| 8 · mittel | Downloadlimits konnten durch parallele Requests überschritten werden; Streamabbrüche wurden uneinheitlich gezählt. | Bedingtes atomisches Reservieren. Ein akzeptierter Downloadversuch verbraucht einen Platz, auch bei anschließendem Abbruch. Pipeline-/Abortbehandlung und sichere ZIP-Pfade. |
| 9 · mittel | Neustarts verloren Sessions; abgelaufene Multipart-Uploads und fehlgeschlagene Löschungen blieben unzuverlässig zurück. | Persistente PostgreSQL-Jobs mit 24-Stunden-Frist, Locks, Scan-Leases/Heartbeat, begrenzter Scanparallelität und dauerhafter Lösch-Outbox. Scannerfehler behalten Job/Quota für Retry und veröffentlichen keine Datei. Cleanup prüft aktuellen Job-/Leasezustand unter Lock. |
| 10 · mittel | Busboy konnte übergroße Dateien abgeschnitten als Erfolg speichern; zusätzliche Dateien wurden verworfen. | Tatsächliche Bytezählung während des Streams, Datei-/Transfer-/Feld-/Partlimits, Trunkierungsfehler und Aufräumen. Exakt am Limit wird akzeptiert; ein Byte darüber und zusätzliche Dateien werden abgelehnt. Begrenzte eigene Multipart-Puffer behandeln Quellstreamfehler und leere Dateien zuverlässig, statt den fehlerhaften SDK-Pfad für unbekannte Streamlängen zu verwenden. |
| 11 · mittel | AES-GCM-Chunks waren nicht an ihre Position gebunden; Chunktausch war reproduzierbar. Linköffnung verlor den Schlüssel. | Version 2 bindet Chunks über AAD an Kontext, Dateiindex, Chunkindex und Klartextlänge. Authentifiziertes verschlüsseltes Manifest erkennt veränderte/fehlende Dateimetadaten. Downloads bleiben bis zur Manifestprüfung gesperrt. Version 1 bleibt lesbar; Reader/Writer werden bei Fehlern abgebrochen. Vollständige Fragmente bei Öffnen/Kopieren/QR; leere Dateien unterstützt. |
| 12 · mittel | Async-Authfehler, überschreibbare aktive TOTP-Schlüssel, doppelt verwendbare Backupcodes und 2FA-Umgehung nach Passwortreset. | HttpOnly-/SameSite-Cookies mit CSRF- und Originprüfung, Secure bei HTTPS. Keine Session-JWTs im LocalStorage. Pending-TOTP mit Ablauf statt Überschreiben, atomare Backupcodes/Reset-Tokens, versionierte 2FA-Challenges. Reset und E-Mail-Verifikation umgehen 2FA nicht; Challenges autorisieren keine API-Aufrufe. |
| 13 · mittel | Downloadlogs speicherten vollständige IPs; Retention erfasste nur eine Logtabelle; README versprach zu viel Privatsphäre. | Einheitliche IPv4-/IPv6-Maskierung und Retention beider Logtabellen, ehrliche Datenschutzaussagen. Systemschrift und lokal gebündelte Natural-Earth-Karte statt Google Fonts / externer Kartenkacheln. |
| 14 · mittel | Beliebige Settings, irreführende Container-Festplattenstatistik, Diagnose mit URL-Token und gespiegelten Secrets. | Typisierte Whitelist mit serialisierter transaktionaler Konsistenzprüfung; Transfer-Speicherbilanz statt falscher physischer Statistik. Admin-Diagnose mit fünf Minuten gültigem Header-Token, Redaktion und Limits. HTML-/URL-Escaping in E-Mails, optionale SMTP-Hostallowlist. Assetuploads erlauben geprüfte Rasterbildsignaturen und lehnen SVG ab. S3-Settings bleiben ausgenommen. |
| 15 · mittel | Ports/TLS-Override, Proxy-Schema/IP-Vertrauen und Deploymentanleitung waren inkonsistent. | Getrennte HTTP-/TLS-Caddy-Konfiguration, funktionierende Portvariablen, erhaltene Proxy-Schemata, begrenztes Proxyvertrauen, Readiness-/Healthchecks. Versionierte Images, persistenter Token, unprivilegiertes Backend, CPU-/RAM-Limits, Dockerignore und Backup-/Restore-Anleitung. Unraid-Templates, Infrastruktur-Compose und wiederholbarer Importer ergänzt. |
| 16 · mittel/niedrig | Alle Frontendseiten lagen im Startbundle, Hookreihenfolge war instabil, Uploadabbruch/Deadlines fehlten; keine Tests/CI/Lizenzdatei. | Lazy-Routes/Charts/Karte, feste Hookreihenfolge, typisierte Transfer-API, Uploadabbruch, begrenzte Retries und Deadlines. Labels, IDs und Modal-Fokusführung verbessert. Regressionstests, CI mit separater Storage-Integration und MIT-Lizenzdatei ergänzt. |

## Unraid und Betrieb (historisch)

Die [README](../README.md#unraid) enthält den gewünschten Einzeiler für den Import
beider DockerMan-Templates sowie lokale Image-Builds, Infrastrukturstart,
Setup-/Neuerstellungsablauf, TLS/Reverse Proxy, Bereitschaftsprüfung und Updates.
Die Templates installieren Backend und Web; PostgreSQL, Redis, MinIO, ClamAV und
Caddy laufen über die mitgelieferte Infrastruktur-Compose. Interne Dienste werden
nicht auf Hostports veröffentlicht. Vorhandene Templateanpassungen werden gesichert.

Der Download-Einzeiler lädt die veröffentlichten Templates von `master`.
Aus dem lokalen Checkout ist der Import ebenfalls möglich.
Es wurde kein Community-Applications-Eintrag und kein Registry-Image veröffentlicht.

Weitere Anleitungen: [Migration, Credentials, Proxy, Backup und Datenschutz](operations.md)
und [Testbefehle / isolierte Fixtures](testing.md). MinIO wird aus einem offiziellen,
festgelegten Source-Commit mit Go-Checksumprüfung gebaut; seine AGPL-3.0-Lizenz ist
von der MIT-Lizenz der Anwendung getrennt.

## Abhängigkeiten und verbleibende Wartungsarbeit (historisch)

| Audit | Aktueller Befund |
| --- | --- |
| Backend, produktiv und insgesamt | **2 mittel**, `minio` / dessen `stream-json`-Abhängigkeit; keine hohen/kritischen Befunde |
| Frontend, produktiv | **0** |
| Frontend, einschließlich Entwicklung | **5 hoch** in der Tailwind-3-Buildkette: `braces`, `micromatch`, `fast-glob`, `chokidar`, `tailwindcss` |

Die verbleibende SDK-Meldung betrifft den JSON-Parser für Notifications; diese
SDK-Funktion wird von der Anwendung nicht verwendet. Ein kompatibler Upstream-Fix
ist weiterhin zu verfolgen. Die Frontendmeldungen betreffen lokale Buildwerkzeuge;
eine Tailwind-4-Migration mit visueller Regression ist die nächste Wartungsaufgabe.
Es wurde kein inkompatibles `audit fix --force` angewendet. CI lehnt hohe/kritische
**Produktiv**befunde ab. Diese Schwelle ist keine Aussage, dass mittelgradige oder
Entwicklungsbefunde automatisch unbedenklich seien. Auditdaten sind eine Momentaufnahme.

Das initiale JS-Bundle sank von rund **1,19 MB / 346 kB gzip** auf
**275 kB / 93 kB gzip**. Die Admin-Charts bleiben als separat nachgeladenes Paket
bei rund **537 kB** und erzeugen eine Buildwarnung; weitere Verkleinerung ist möglich.
Einzelne ältere Verwaltungsoberflächen enthalten weiterhin `any`-Typen.

## Ausgeführte Prüfungen und Grenzen (historisch)

| Prüfung | Ergebnis / Aussagegrenze |
| --- | --- |
| Backend- und Frontend-TypeScript-/Produktionsbuild | Bestanden; Chart-Chunkwarnung dokumentiert |
| Backend-/Web-/MinIO-Dockerimages | Alle drei aktuellen Images gebaut. Backend-UID 1000 und enthaltene Prisma-/Baseline-Werkzeuge geprüft; nginx-Konfiguration und tatsächlich ausgeliefertes HTML/JS samt Datenschutzheadern geprüft. Proxy folgt auch einer geänderten Backend-IP nach Container-Neuerstellung. |
| Backend-Validierung | 6 Tests bestanden: Metadaten, Framing, Pfade/Limits, Settings, `.env`, IP-Maskierung |
| PostgreSQL-/Redis-Tests | 12 Tests bestanden: parallele Quota/Downloadslots/Settings/Adminänderungen, Jobpersistenz, Delete-Retry, beide Retentiontabellen, Cookie/CSRF, 2FA/Recovery, Diagnoseredaktion und checksumgeschützter Übergang alter Migrationshistorie |
| HTTP-/Scan-Integration | 12 Tests bestanden mit **echtem PostgreSQL, Redis, MinIO und ClamAV**: Bytes/Parts, idempotente Finalisierung, leere Dateien, Quota, Ticket-/ZIP-Downloads, Multipart-Limits/-Streaming, Setup, Cleanup und Clean/EICAR. Der frühere Testdouble-Lauf wurde durch diesen echten Storage-Lauf ergänzt. |
| Browser-Kryptografie | 5 Tests bestanden: Unicode/Keys, AAD-Kontext/Position/Länge, Legacy-/Trunkierungsfehler, leere Dateien, Streamabbruch |
| Chromium | 4 Tests bestanden mit JSON-API-Fixtures und lokalem Downloadserver: Passwort-Retry, Datei-/ZIP-Ticket und heruntergeladene Bytes, Verschlüsselungsfragment/Part-Retry, Uploadabbruch, Manifestintegrität |
| Migrationen | Frischer Containerstart auf leerer PostgreSQL-Datenbank bestanden. Legacy-Historie nur bei korrekter Checksumme umbenannt, falsche Checksumme abgelehnt; finale Schema-Diffs leer, vorhandene Daten erhalten. |
| Vollständiger Containerlauf | PostgreSQL, Redis, gebautes MinIO, Backend, Web und Caddy gestartet; echter ClamAV angeschlossen. Proxy-Readiness, vollständige Zugangsdatenrotation mit Neuerstellung, Erstadmin, HttpOnly-Cookies, echter Virenscan und Passwort-Datei-/ZIP-Downloads bestanden. |
| Backup / Restore | Mit dem Backuphelper einen echten MinIO-Datenstand und PostgreSQL gesichert. Dump in isolierte DB zurückgespielt, MinIO-Kopie und zweites Backend gestartet und tatsächlicher Download bytegleich geprüft. |
| Compose / Caddy / Unraid / Shell | HTTP-/TLS-/Unraid-Konfigurationen validiert, Caddy HTTP/TLS geprüft, XML geparst und Shellsyntax geprüft |
| Konfiguration / Import | Zufallscredentials, Token-/Dateirechte, Compose-/Unraid-Portmodi und unveränderte Wiederholung geprüft. Templateimport, Backup und atomarer Abbruch bei Downloadfehler geprüft. |
| GitHub Actions | Workflow für Push/Pull Request ergänzt. Ein erfolgreicher Remotelauf ist zusätzlich zu den lokalen Prüfungen zu prüfen. |

Die anfangs blockierten Go-Artefakte sind inzwischen erreichbar. MinIO wurde mit
normaler TLS-/Checksumprüfung gebaut; SDK-/Multipart- und Persistenzabläufe wurden
anschließend gegen dieses Image geprüft. Der vollständige Erststart deckte die
falsche ursprüngliche Migrationsreihenfolge auf; sie wurde vor Veröffentlichung
korrigiert. nginx löst Backend-Adressen dynamisch über Docker-DNS auf, damit die
Neuerstellung nach Credentialrotation keine veraltete Upstream-IP behält.

Keine Unraid-Maschine war verfügbar. Öffentliche ACME-Zertifikatsausstellung,
Secure-Cookies über die tatsächliche Ziel-Proxykette und der Betrieb auf Unraid
bleiben Zielsystemprüfungen. Die README beschreibt diese Schritte ausdrücklich.
S3-Providerwechsel bleibt der bewusst nicht umgesetzte hochprioritäre Befund.
