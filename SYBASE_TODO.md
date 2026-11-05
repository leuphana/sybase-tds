# Sybase-TDS-Treiber — Fixes & TODOs für Produktionsreife

Grundlage: Code-Review von `sybase-tds` (dieses Repo) und dem darauf aufbauenden
TypeORM-Fork (`~/Projects/typeorm`, Treiber unter `src/driver/sybase/`),
im Kontext der geplanten Migration von bibdock/php (Laravel) auf NestJS+TypeORM.
Ziel: aus dem aktuellen Proof-of-Concept einen produktionsreifen Treiber machen.

## Sofort — Status klären

- [x] **Integrationstests gegen echten Host laufen lassen.** Am 2026-09-22 gegen
      `t-lbslue.gbv.de:2025` (User `lbs`) ausgeführt — laut Klarstellung vom
      2026-11-05 ein **Testserver** (nicht produktiv). Vorab
      geprüft: alle Schreibzugriffe in den Integrationstests laufen ausschließlich
      auf `#`-präfixierten Temp-Objekten (Tempdb, sitzungsgebunden) — reale
      GBV-Tabellen/Daten werden nicht berührt. **Ergebnis: 11 von 34 Suiten
      rot, 55 von 572 Einzeltests rot.** Details siehe "Testlauf-Ergebnisse"
      unten — daraus ergeben sich mehrere neue, konkrete Prio-1-Punkte.

## Testlauf-Ergebnisse (2026-09-22, gegen echten Server)

Reproduzierbar mit `npm test` bzw. `npx jest <pfad>`.

1. ~~**[KRITISCH] `TypeMapper.encodeParam()` liefert für mehrere numerische Typen
   falsche Bytes**~~ **BEHOBEN (2026-09-22).** War in Wahrheit zwei getrennte
   Ursachen:
   - **Echter Treiberbug**: `_encodeDecn()` schrieb die DECN/NUMN-Magnitude-Bytes
     Little-Endian, `_decodeDecn()` erwartet (nachweislich korrekt gegen den
     echten Server verifiziert über `datatypes.test.ts` → `DECIMAL(10,2)` exakt
     `"99.99"`) Big-Endian. Dadurch war der Round-Trip von Decimal-Parametern
     über Prepared Statements kaputt (encode ≠ inverse von decode). Fix in
     `src/types/type-mapper.ts::_encodeDecn` (Magnitude jetzt Big-Endian,
     analog zu `_decodeDecn`).
   - **Testbug**: `tests/unit/types/type-mapper.test.ts` hatte `byteswap=true/false`
     mit LE/BE vertauscht (Kommentar sagte "byteswap=false = LE, Standard" —
     tatsächlich ist `byteswap=false` laut `PROGRESS.md`-Designentscheidung und
     echtem Server-Test Big-Endian, der TDS-5.0-Standard). Zusätzlich bauten die
     Rohdaten-Helfer (`moneyRaw`, `dateRaw`, `timeRaw`, `datetimeRaw`,
     `shortDateRaw`, `decnRaw`) durchgängig Little-Endian-Bytes, obwohl
     `decode()` für MONEY/SHORTMONEY/DATE/TIME/DATETIME/SHORTDATE/DECN/NUMN
     **unabhängig vom `byteswap`-Flag fest Big-Endian liest** (kein `this.byteswap`-
     Check in diesen Decode-Pfaden — das ist vermutlich beabsichtigt/korrekt für
     diese zusammengesetzten Typen, aber nie gegen einen Little-Endian-Server
     verifiziert, siehe Punkt unten). Beide Stellen korrigiert.
   - **Ergebnis**: `type-mapper.test.ts` 95/95 grün (vorher 47/95 plus Absturz
     der ganzen Suite durch nicht-JSON-serialisierbares `BigInt` in einer
     Fehlermeldung). Gesamter `npm test`-Lauf: 612/667 grün (vorher 517/572),
     keine neuen Fehlschläge.
   - **Offener Restpunkt (niedrige Priorität)**: `decode()` für MONEY/DATE-Familie
     und DECN/NUMN ignoriert `byteswap` komplett und liest immer BE. Das ist für
     den aktuellen Zielserver (ASE 15.7, BE) korrekt, aber **nie gegen einen
     Little-Endian-Sybase-Server getestet** — falls das später relevant wird
     (anderer Servertyp), muss geprüft werden, ob diese Typen auf der Leitung
     wirklich immer BE sind oder ob hier ein `byteswap`-Check fehlt.
2. ~~**[Hoch] `connect()` sendet seit der "ANSI quoted identifiers"-Änderung
   unconditional ein zusätzliches `OPTIONCMD` nach dem Login**~~ **BEHOBEN
   (2026-09-22).** War wie vermutet ein reiner Test-Hygiene-Bug, kein
   Treiberbug: `MockSocket`-Testhelfer in `connection.test.ts`, `cursor.test.ts`,
   `transaction.test.ts`, `prepared-statement.test.ts` um eine zweite geqeute
   Antwort (`doneOnlyBuf()`) für die ANSI-QUOTED_IDENT-Roundtrip ergänzt.
   Beim Aufdecken der eigentlichen Testergebnisse (vorher durch den Timeout
   verdeckt) kamen zwei weitere, unabhängige Testbugs zum Vorschein und
   wurden mitgefixt:
   - `queryResponseBuf()`-Testhelfer (`tests/unit/mock-socket.ts`) schrieb den
     INT4-Zeilenwert Little-Endian, unabhängig vom `byteswap`-Flag der
     jeweiligen Test-Connection — Helfer bekam einen `byteswap`-Parameter
     (Default `false`/BE, wie der Produktivcode).
   - `prepared-statement.test.ts` erwartete, dass PREPARE nie ein PARAMFMT-Token
     enthält — laut `TDS_QUERY_PROTOKOLL.md` ("Phase 1: PREPARE … Sendet
     DYNAMIC(PREPARE) + PARAMFMT") gehört PARAMFMT aber genau dorthin, wenn
     beim Aufruf Parameter-Formate mitgegeben werden. Test in zwei Fälle
     aufgeteilt (mit/ohne mitgegebene Typen).
   - **Ergebnis**: `npm test` jetzt 650/668 grün (vorher 612/667), keine neuen
     Regressionen. Die verbleibenden 18 Fehlschläge sind exakt die Punkte
     #3–#6 unten.
3. ~~**[Mittel] `ConnectionPool.create(...)` existiert nicht**~~ **BEHOBEN (2026-11-05):**
   Konstruktor ist die API (Commit 7c6e1cb), Unit-Test angepasst. — `connection-pool.ts`
   hat nur einen öffentlichen Constructor (`new ConnectionPool(options, poolOptions)`),
   der Test (`tests/unit/connection-pool.test.ts`) erwartet aber eine statische
   Factory `.create()`. Kompletter Suite-Compile-Fehler (TS2339), 0 der
   Pool-Unit-Tests liefen. Entweder Test an echte API anpassen oder `.create()`
   als Alias ergänzen (API-Drift klären, bevor der Pool woanders (TypeORM) fest
   verdrahtet wird).
4. **[Info/Testbug, kein Treiberbug] `CREATE PROCEDURE #name` wird von Sybase
   ASE 15.7 abgelehnt** (`stored-procedure.test.ts`, 4/4 Tests rot):
   `"CREATE PROCEDURE cannot create a temporary object (with '#' as the first
   character name."`. Anders als bei Tabellen erlaubt ASE keine `#`-präfixierten
   temporären Prozedurnamen — die Tests müssten stattdessen (a) eine Prozedur in
   einer dedizierten Test-DB anlegen und danach explizit droppen, oder (b) ganz
   auf Test-Prozeduren verzichten und `sp_executesql`-artige Ad-hoc-Ausführung
   testen. Vorsicht: Variante (a) erfordert Schreibrechte auf eine echte
   (Nicht-Temp-)DB — vor Umsetzung klären, ob/wo das gefahrlos möglich ist.
5. **[Mittel] Prepared Statements mit `?`-Parametern schlagen gegen den echten
   Server fehl**, wenn der Platzhalter außerhalb WHERE/SET/VALUES steht:
   `"The untyped variable ? is allowed only in ... WHERE clause ... SET clause
   ... VALUES list"` (`prepared-statement.test.ts`, 7 Tests;
   `connection.test.ts`-Integration, 1 Test). Die Testqueries nutzen `?` u.a.
   direkt in `SELECT ?` bzw. als reinen Ausdruck — das ist eine reale
   ASE-15.7-Einschränkung (kein "untyped" Parameter außerhalb dieser Klauseln),
   keine Treiber-Fehlfunktion. Für den TypeORM-Adapter relevant: QueryBuilder
   darf `?`-Parameter nur in diesen drei Kontexten erzeugen — ggf. Parameter in
   anderen Positionen (z.B. `SELECT`-Projektionen) clientseitig typisiert
   einsetzen (`CONVERT(...)`) statt als reinen Platzhalter.
6. ~~**[Niedrig] `packetNumber`-Default ist `0` statt `1`**~~ **GEKLÄRT (2026-11-05):**
   0 wurde in Commit 576acf5 bewusst gegen den echten Server eingestellt und
   funktioniert; Tests auf 0 angepasst (Doku sagt 1, ASE wertet das Feld nicht aus). (`tds-packet.test.ts`,
   `tds-socket.test.ts`, 2 Tests) — reiner Erwartungswert-Unterschied
   (Off-by-one), betrifft nur das allererste Paket einer Verbindung. Muss
   geklärt werden, ob TDS 5.0 wirklich mit Paketnummer 1 zu starten hat (Doku:
   `TDS_LOGIN_PAKET.md`) — falls ja, ist es ein echter (kleiner) Protokollbug,
   falls nein, sind die Tests veraltet.

## Code-Review 2026-11-05 — Treiber-interne Befunde

Ergebnis eines Durchgangs durch `src/` (zusätzlich zu den Punkten oben/unten,
die v.a. den TypeORM-Fork betreffen). Nummern = Priorität.

### Kritisch (falsche Daten / Abstürze)

- [x] **K1 Variable Parameter > 255 Byte werden korrumpiert.** `TypeMapper._encodeVariable`
      schreibt die Länge immer in 1 Byte (`Buffer.from([300])` → `44`). Lange
      Strings/Binärdaten müssen als LONGCHAR/LONGBINARY mit 4-Byte-Länge gesendet
      oder mit klarem Fehler abgelehnt werden.
- [x] **K2 MONEYN/DATETIMN/DATEN/TIMEN werden Little-Endian encodiert**, aber
      Big-Endian decodiert (gleiche Fehlerklasse wie der DECN-Fix). Betrifft jeden
      `Date`-Parameter (`_inferFormat` → DATETIMN).
- [x] **K3 RETURNSTATUS (0x79) wird als längenpräfixiertes Token geparst**, ist aber
      Token + fester INT4. Jeder `exec` einer Prozedur führt zu "Unbekannter
      TDS-Token-Typ". PROCID (0x7C) prüfen.
- [x] **K4 Keine Serialisierung von Requests pro Connection.** Parallele `query()`-Aufrufe
      senden mehrere Requests, bevor die erste Antwort gelesen ist (TDS-Verstoß,
      geteilter Parser-State). Request-Queue/Mutex einführen.
- [x] **K5 `byteswap: true` ist unbrauchbar** — Token-Längen, DONE, EED werden immer BE
      gelesen. Option entfernen bzw. auf BE festlegen.

### Hoch (Robustheit / Sicherheit)

- [x] **H6 Keine Timeouts, kein Cancel.** `connect()` und `receive()` können ewig hängen;
      kein ATTENTION, kein TCP-Keepalive.
- [x] **H7 Pool ohne Health-Check.** Tote Connections werden wieder ausgegeben; offene
      Transaktion wird bei `release()` nicht zurückgerollt; `min` unbenutzt;
      `pool.end()` schließt aktive Connections nicht; kein `acquireTimeout`.
- [ ] **H8 Passwort im Klartext, kein TLS.** *(teilweise: `tls`-Option eingebaut, ungetestet;
      Passwortverschlüsselung offen – Protokoll steht nicht in der lokalen Doku)* `encryptedPassword` leert nur das Feld.
      Zielhost ist extern (`t-lbslue.gbv.de`) → TLS-Option nötig; mit Betrieb/GBV
      klären, ob der Listener SSL anbietet.
- [x] **H9 Encoding faktisch fest UTF-8.** `Connection._encoding` wird nie gesetzt,
      `TypeMapper` decodiert hart `utf8`; ENVCHANGE (Charset, Packetsize, DB) wird
      ignoriert.
- [x] **H10 Fehler-/Ergebnisbehandlung in `_collectResult`.** Bricht beim ersten EED ab,
      ohne die Antwort zu Ende zu lesen; DONE-Error-Flag ignoriert; mehrere
      Resultsets werden in ein `rows`-Array gemischt; Info-/PRINT-Meldungen gehen
      verloren.

### Mittel (fachliche Korrektheit / Performance)

- [x] **M11 `_inferFormat`:** `bigint`/`Buffer` → VARCHAR, Integer > 2³¹ → RangeError.
- [x] **M12 Datum/Geld:** TIME-Encode verliert ms; DATE-Decode unsigned (vor 1900 falsch);
      MONEY über `Number` (Präzisionsverlust); UTC-Interpretation dokumentieren.
- [x] **M13 Cursor:** `fetch(count)` ignoriert `count`, Parameter werden nicht gesendet,
      kein End-of-Data.
- [x] **M14 Performance:** O(n²) `Buffer.concat` beim Empfang; Default-Packetsize 512;
      ausgehandelte Packetsize (ENVCHANGE) wird nicht übernommen.
- [x] **M15 `query()` ohne Parameter-Binding** → SQL-Injection-Risiko bei String-Bau.
      LANGUAGE-Token mit Argumenten prüfen.

### Umsetzungsstand (2026-11-05)

Alle Punkte oben sind mit Unit-Tests abgedeckt (`tests/unit/review/*.test.ts`,
`tests/unit/connection-pool.test.ts`; 660/660 grün) und am 2026-11-05 gegen den
GBV-Testserver (ASE 15.7 SP122) verifiziert: `npm run test:integration` **103/103 grün**,
u.a. neue Suite `tests/integration/review-verification.test.ts`. Die vorher roten
Prepared-Statement- und Prozedur-Tests (Punkte 4 und 5 oben) nutzen jetzt gültige
ASE-Konstrukte (`?` nur in WHERE/VALUES, System-Prozeduren statt `#`-Prozeduren).

Verifikationsliste:

- [x] K2: Round-Trip `DATETIME`/`SMALLDATETIME`/`DATE`/`TIME`/`MONEY`-Parameter über
      Prepared Statements (Byte-Reihenfolge war vorher LE, jetzt BE wie decode).
- [x] K3: `RETURNSTATUS` = Token + INT4 (Layout steht nicht in der lokalen Doku);
      `exec sp_...` mit Return-Status und Output-Parametern (PARAMFMT/PARAMS).
      PROCID (0x7C) wird weiter als längenpräfixiert übersprungen – prüfen.
      → Return-Status verifiziert (`sp_server_info`, `sp_help`). **Offen:** Output-Parameter
      (PARAMFMT/PARAMS) – kommen nur bei RPC-Aufrufen, dafür gibt es noch keine High-Level-API.
- [x] K1: LONGCHAR/LONGBINARY-Parameter > 255 Byte (wird ASE so akzeptiert?).
- [x] M11: `bigint`/große Ganzzahlen als INTN(8)-Parameter.
- [x] H6: `requestTimeout` mit `waitfor delay` → ATTENTION wird bestätigt (DONE_ATTN),
      Connection danach weiter nutzbar.
- [x] H7: `DONE_INXACT` wird von ASE wie erwartet gesetzt (Pool-Rollback hängt daran,
      zusätzlich zum `Transaction`-Flag).
- [x] H9: Welchen Charset meldet der Server per ENVCHANGE beim Login mit `utf8`?
      Umlaute in VARCHAR-Spalten lesen/schreiben. Bei `iso_1`-Server: Driver
      decodiert jetzt automatisch Latin-1.
      → Server akzeptiert `utf8` (kein Charset-Wechsel), Umlaute in Literal und Parameter korrekt.
      Damit ist der Prio-1-Punkt "Encoding/Charset" treiberseitig geklärt.
- [x] M14: Angefragte Paketgröße 2048 – Server bestätigt per ENVCHANGE? → ja, 2048.
- [ ] **Neu, offen:** TEXT/IMAGE-Spalten in ROW-Tokens. Der Parser liest sie wie
      LONGCHAR (4-Byte-Länge). In TDS 5.0 haben TEXT/IMAGE-Zeilenwerte
      üblicherweise zusätzlich einen Text-Pointer + Timestamp vor der Länge – die
      lokale Doku beschreibt das nicht, daher nicht geändert. Integrationstest mit
      einer `text`-Spalte nötig, bevor TEXT/IMAGE produktiv gelesen werden.

### Hygiene

- [x] Rote Unit-Suiten: `ConnectionPool.create`, `packetNumber`-Default (Punkte 3 und 6 oben).
- [x] `ConnectOptions` um `database`, `appName`, `connectTimeout` ergänzen.
- [x] `tests/test.ts` (Bastel-Skript) entfernt.
- [ ] CI + ESLint; Fehlermeldungen einheitlich (Deutsch/Englisch gemischt).
- [x] **Achtung:** `jest.config.js` lädt `.env` → `npm test` lief Integrationstests
      automatisch gegen den GBV-Testhost. Für lokale Läufe `npx jest tests/unit` nutzen.

## Priorität 1 — Blocker für jeden Produktiveinsatz

- [ ] **OFFSET/Pagination — bewusst NICHT im Treiber emulieren.** TypeORM-seitig
      wirft `.skip()` aktuell `OffsetNotSupportedError` (`SelectQueryBuilder.ts`) —
      das bleibt so, da Sybase ASE 15.7 kein natives OFFSET kennt und eine
      stille Emulation im Treiber genau diese Einschränkung vor Konsumenten
      verstecken würde (schlecht, v.a. falls der Fork später öffentlich/als MR
      bereitgestellt wird). Stattdessen: Fehlermeldung präzisieren/dokumentieren
      (klarer Hinweis, dass Pagination anwendungsseitig zu implementieren ist),
      und die eigentliche Cursor-/Row-Number-Emulation als **Anwendungscode in
      der Migration** bauen (z.B. ein Repository-Helper im NestJS-Projekt),
      nicht in TypeORM selbst. Als fachliche Spezifikation dient die
      PHP-Referenzimplementierung `bibdock/php/app/Database/LhlueBuilder.php`
      (~160 Zeilen, inkl. Tests in
      `bibdock/php/tests/Unit/Database/LhlueBuilderTest.php`): Zwei-Schritt-
      Cursor-Query, Sonderfall "SELECT-Alias nicht in HAVING referenzierbar",
      explizite `CONVERT(FLOAT, ...)`-Casts für Zahlenvergleiche.
- [ ] **`database`-Option wird beim Connect nicht verwendet.** *(Treiberseitig jetzt
      `ConnectOptions.database` → `use <db>`; der TypeORM-Fork muss sie nur noch durchreichen.)* In
      `typeorm/src/driver/sybase/SybaseDriver.ts` wird `this.database` gesetzt,
      aber nie an `connectOptions` übergeben und es folgt kein `USE <database>`.
      Muss geprüft/gefixt werden — sonst landet man ggf. auf der falschen
      Datenbank oder es schlägt fehl, sobald mehrere DBs auf dem Server liegen.
- [ ] **Echte Integrationstests für den TypeORM-Adapter.** `typeorm/src/driver/sybase/`
      hat aktuell **null** Tests (kein `test/**/*sybase*`). Mindestens:
      Connect/Disconnect, CRUD über Repository, QueryBuilder mit Joins,
      Schema-Introspection (`loadTables`) gegen eine echte Instanz, Transaktionen
      (commit/rollback), Connection-Pool unter Last (mehrere parallele Queries).
- [ ] **`sybase-tds` als Dependency deklarieren.** Aktuell nirgends in
      `typeorm/package.json` (weder `dependencies` noch `peerDependencies`) —
      nur per `require("sybase-tds")` in `PlatformTools.load()` referenziert,
      ohne Versions-Pin. Sollte wie `mssql`/`mysql2`/`pg` als optionale
      `peerDependency` mit Versionsrange eingetragen werden.
- [ ] **Encoding/Charset der Verbindung verifizieren.** Der PHP-Cast
      `Latin1ToUTF8.php` (der in der Migration bewusst wegfällt) legt nahe, dass
      die Sybase-Instanz Text in ISO-8859-1 speichert. Sicherstellen, dass
      `sybase-tds`/`TypeORM` das Charset der Verbindung korrekt aushandelt
      (Login-Token `charset`/`language`, siehe `LoginToken`) und Strings beim
      Lesen/Schreiben automatisch korrekt transkodiert werden — sonst kommt das
      Encoding-Problem in neuer Form zurück, nur unsichtbar.

## Priorität 2 — Wichtige Funktionslücken

- [ ] **Savepoints / nested Transactions.** Aktuell `transactionSupport = "simple"`
      im TypeORM-Treiber, `Transaction`-Klasse in `sybase-tds` kennt nur
      `begin()/commit()/rollback()` auf oberster Ebene. Prüfen, ob TDS 5.0/ASE
      15.7 das grundsätzlich hergibt (laut eigener `docs/TYPEORM.md`: "Sybase
      unterstützt keine Savepoints in TDS 5.0") — falls nicht nachrüstbar, das
      explizit dokumentieren, damit Anwendungscode (NestJS-Services) keine
      verschachtelten Transaktionen annimmt.
- [ ] **Upsert / `RETURNING`.** `supportedUpsertTypes = []`,
      `isReturningSqlSupported() = false`. Laut eigener Doku als Workaround
      vorgesehen: `SELECT @@IDENTITY` nach INSERT. Diesen Workaround im
      TypeORM-QueryRunner tatsächlich implementieren (aktuell nur
      dokumentiert, nicht gebaut), damit `@PrimaryGeneratedColumn` nach
      `save()` die erzeugte ID zurückliefert.
- [ ] **Streaming.** Wirft aktuell hart `"Streaming is not supported by the
      Sybase driver."`. Für bibdock vermutlich nicht kritisch (keine
      Streaming-Queries in der PHP-Codebasis gefunden) — aber im Auge behalten,
      falls Reports/Exports über große Ergebnismengen gebaut werden.
- [ ] **Named Placeholders.** `NamedPlaceholdersNotSupportedError` — TypeORM
      nutzt intern teils benannte Parameter; sicherstellen, dass alle
      QueryBuilder-Pfade, die bibdock nutzt (Relations/Joins, `WHERE IN`),
      tatsächlich nur mit den unterstützten `?`-Positional-Parametern arbeiten.

## Priorität 3 — Später / Nice-to-have

- [ ] CTE-Unterstützung (`cteCapabilities.enabled = false`) — bibdock nutzt
      laut Code-Review keine rekursiven Queries, daher niedrige Priorität.
- [ ] Tree-Entities (`treeSupport = false`) — kein bekannter Bedarf in bibdock.
- [ ] Full-Text-Suche, UUID-Generierung serverseitig — kein bekannter Bedarf.
- [ ] Exclusion Constraints (wirft aktuell bewusst Fehler) — Sybase-ASE kennt
      dieses Postgres-Konzept ohnehin nicht, kein echter Gap.

## Prozess-TODOs

- [ ] CI-Job einrichten, der die Integrationstests (Unit + `tests/integration/`)
      regelmäßig gegen eine Test-Sybase-Instanz laufen lässt — aktuell keine
      CI-Abdeckung für dieses Paket.
- [ ] Sobald die o.g. Priorität-1-Punkte erledigt sind: kurzer Lasttest des
      `ConnectionPool` (parallele Verbindungen, Idle-Timeout-Verhalten) unter
      realistischer bibdock-Last simulieren, bevor der Treiber produktiv geht.
