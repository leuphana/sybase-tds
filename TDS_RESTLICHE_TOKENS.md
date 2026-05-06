# TDS 5.0 – Restliche Token-Protokolle (jConn4)

Quellen: `CurDeclareToken.java`, `CurDeclare2/3Token.java`, `CurOpenToken.java`,
`CurFetchToken.java`, `CurCloseToken.java`, `CurDeleteToken.java`,
`CurUpdateToken.java`, `CurInfoToken.java`, `CurInfo3Token.java`,
`CapabilityToken.java`, `DoneToken.java`, `EedToken.java`,
`EnvChangeToken.java`, `LoginAckToken.java`, `MsgToken.java`,
`OptionCmdToken.java`, `LogoutToken.java`, `KeyToken.java`, `TdsCursor.java`

---

## Übersicht aller Token

### Client → Server (Sende-Token)

| Token | Hex | Dez | Beschreibung |
|-------|-----|-----|--------------|
| `CURDECLARE` | `0x86` | 134 | Cursor deklarieren (kurz) |
| `CURDECLARE2` | `0x23` | 35 | Cursor deklarieren (4-Byte-Längen) |
| `CURDECLARE3` | `0x10` | 16 | Cursor deklarieren (4-Byte-Typ) |
| `CUROPEN` | `0x84` | 132 | Cursor öffnen |
| `CURFETCH` | `0x82` | 130 | Zeilen vom Cursor holen |
| `CURCLOSE` | `0x80` | 128 | Cursor schließen / freigeben |
| `CURDELETE` | `0x81` | 129 | Aktuelle Zeile löschen |
| `CURUPDATE` | `0x85` | 133 | Aktuelle Zeile aktualisieren |
| `CURINFO` | `0x83` | 131 | Cursor-Konfiguration setzen / abfragen |
| `CURINFO3` | `0x88` | 136 | Cursor-Konfiguration (erweitert) |
| `CAPABILITY` | `0xE2` | 226 | Fähigkeiten aushandeln |
| `MSG` | `0x65` | 101 | Nachricht / Security-Handshake |
| `OPTIONCMD` | `0xA6` | 166 | Server-Optionen setzen |
| `LOGOUT` | `0x71` | 113 | Verbindung beenden |
| `KEY` | `0xCA` | 202 | Schlüsselspalten für positionierte Updates |

### Server → Client (Empfangs-Token)

| Token | Hex | Dez | Beschreibung |
|-------|-----|-----|--------------|
| `LOGINACK` | `0xAD` | 173 | Login-Bestätigung |
| `DONE` | `0xFD` | 253 | Befehl abgeschlossen |
| `DONEPROC` | `0xFE` | 254 | Stored Procedure abgeschlossen |
| `DONEINPROC` | `0xFF` | 255 | Unterbefehl innerhalb SP abgeschlossen |
| `EED` | `0xE5` | 229 | Fehlermeldung / erweiterte Fehlerinfo |
| `ENVCHANGE` | `0xE3` | 227 | Umgebungsänderung (DB/Charset/Sprache) |
| `ROWFMT` | `0xEE` | 238 | Spalten-Metadaten (Standard) |
| `ROWFMT2` | `0x61` | 97 | Spalten-Metadaten (erweitert) |
| `ROW` | `0xD1` | 209 | Datenzeile |
| `ALTFMT` | `0xA8` | 168 | Aggregat-Spaltenformat |
| `ALTROW` | `0xD3` | 211 | Aggregat-Datenwert |

---

## TDS Netzwerk-Header (Wiederholung)

| Byte | Feld | Wert für Cursor-Operationen |
|------|------|-----------------------------|
| 0 | PDU-Typ | `0x01` = BUF_LANG |
| 1 | Status | `0x01` = letztes Paket |
| 2–3 | Paketlänge | Big-Endian |
| 4–5 | Channel | `0x00 0x00` |
| 6 | Paketnummer | ab 1 |
| 7 | Window | `0x00` |

---

## 1. Cursor-Operationen

### Ablauf eines Cursor-Lebenszyklus

```
Client → Server:   CURDECLARE  (Cursor definieren + SQL angeben)
                   CURINFO     (optional: Fetch-Größe setzen)
                   CUROPEN     (Cursor öffnen)
                   [PARAMFMT + PARAMS + Parameterdaten, falls Parameter]
Server → Client:   CURINFO     (Bestätigung mit Cursor-ID)
                   DONE

Client → Server:   CURFETCH    (Zeilen holen)
Server → Client:   ROWFMT      (Spalten-Metadaten, beim ersten Fetch)
                   ROW × n     (Datenzeilen)
                   DONE

Client → Server:   CURDELETE / CURUPDATE  (positionierte Operationen)
                   KEY         (Schlüsselspalten-Referenz)
Server → Client:   DONE

Client → Server:   CURCLOSE    (Cursor schließen oder freigeben)
Server → Client:   DONE
```

---

### 1.1 CURDECLARE – Cursor deklarieren

**Quelldatei:** `CurDeclareToken.java`  
**Token-Typ:** `0x86` (134)

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Token-Typ** | `0x86` (CURDECLARE) |
| 1–2 | 2 | **Gesamtlänge** | `1 + nameLen + 1 + 1 + 2 + queryLen + 1 + colLen` |
| 3 | 1 | **Cursor-Name-Länge** | Byte-Länge des Cursor-Namens |
| 4–… | n | **Cursor-Name** | z. B. `"jconnect_implicit_1"` |
| 4+n | 1 | **Cursor-Typ** | Bit-Flags (siehe Cursor-Typ-Tabelle) |
| 5+n | 1 | **hasArgs** | `0x00` = keine Parameter; `0x01` = Parameter folgen |
| 6+n – 7+n | 2 | **SQL-Länge** | Byte-Länge des SQL-Texts (Short) |
| 8+n – … | m | **SQL-Text** | Cursor-Query, z. B. `"SELECT * FROM t"` |
| 8+n+m | 1 | **Spaltenanzahl** | Anzahl benannter Output-Spalten (0 = keine) |
| … | var | **Spalten-Blöcke** | Pro Spalte: `[1 Byte Länge][n Bytes Name]` |

---

### 1.2 CURDECLARE2 – Cursor deklarieren (groß)

**Quelldatei:** `CurDeclare2Token.java`  
**Token-Typ:** `0x23` (35)  
Verwendet wenn SQL-Text > ~65.500 Bytes oder viele Spalten.

| Offset | Größe | Feld | Abweichung von CURDECLARE |
|--------|-------|------|---------------------------|
| 0 | 1 | **Token-Typ** | `0x23` statt `0x86` |
| 1–4 | **4** | **Gesamtlänge** | Unsigned Int statt Short |
| … | 1 | Cursor-Name-Länge | gleich |
| … | n | Cursor-Name | gleich |
| … | 1 | Cursor-Typ | gleich (1 Byte) |
| … | 1 | hasArgs | gleich |
| … | **4** | **SQL-Länge** | Unsigned Int statt Short |
| … | m | SQL-Text | gleich |
| … | **2** | **Spaltenanzahl** | Short statt Byte |
| … | var | Spalten-Blöcke | gleich |

---

### 1.3 CURDECLARE3 – Cursor deklarieren (erweitert)

**Quelldatei:** `CurDeclare3Token.java`  
**Token-Typ:** `0x10` (16)  
Wie CURDECLARE2, aber mit 4-Byte Cursor-Typ-Feld.

| Offset | Größe | Feld | Abweichung von CURDECLARE2 |
|--------|-------|------|----------------------------|
| 0 | 1 | **Token-Typ** | `0x10` statt `0x23` |
| 1–4 | 4 | Gesamtlänge | Unsigned Int (gleich) |
| … | 1 | Cursor-Name-Länge | gleich |
| … | n | Cursor-Name | gleich |
| … | **4** | **Cursor-Typ** | Int statt Byte — ermöglicht alle Flags |
| … | 1 | hasArgs | gleich |
| … | 4 | SQL-Länge | Unsigned Int (gleich) |
| … | m | SQL-Text | gleich |
| … | 2 | Spaltenanzahl | Short (gleich) |
| … | var | Spalten-Blöcke | gleich |

---

### Cursor-Typ-Flags

Aus `TdsConst.java` und `TdsCursor.setType()`:

| Bit | Wert (dez) | Konstante | Bedeutung |
|-----|-----------|-----------|-----------|
| 0 | `1` | `CUR_RDONLY` | Nur-Lese-Cursor |
| 1 | `2` | `CUR_UPDATABLE` | Aktualisierbarer Cursor |
| 2 | `4` | `CUR_SENSITIVE` | Änderungen anderer Transaktionen sichtbar |
| 3 | `8` | `CUR_DYNAMIC` | Dynamischer Cursor |
| 5 | `32` | `CUR_INSENSITIVE` | Snapshot-Cursor (Änderungen nicht sichtbar) |
| 6 | `64` | `CUR_SEMISENSITIVE` | Semi-sensitiver Cursor |
| 7 | `128` | `CUR_KEYSETDRIVEN` | Keyset-gesteuerter Cursor |
| 8 | `256` | `CUR_SCROLLABLE` | Scrollbarer Cursor |
| 9 | `512` | `CUR_RELLOCKSONCLOSE` | Sperren bei Close freigeben |

---

### 1.4 CUROPEN – Cursor öffnen

**Quelldatei:** `CurOpenToken.java`  
**Token-Typ:** `0x84` (132)

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Token-Typ** | `0x84` (CUROPEN) |
| 1–2 | 2 | **Gesamtlänge** | `5` ggf. `+ 1 + nameLen` (wenn ID=0) |
| 3–6 | 4 | **Cursor-ID** | Numerische ID (0 = noch keine ID zugeteilt) |
| 7 | 1 | **Name-Länge** | *Nur wenn Cursor-ID = 0* |
| 8–… | n | **Cursor-Name** | *Nur wenn Cursor-ID = 0* |
| … | 1 | **hasArgs** | `0x00` = keine Parameter; `0x01` = Parameter folgen |

---

### 1.5 CURFETCH – Zeilen holen

**Quelldatei:** `CurFetchToken.java`  
**Token-Typ:** `0x82` (130)

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Token-Typ** | `0x82` (CURFETCH) |
| 1–2 | 2 | **Gesamtlänge** | `5` + ggf. Name + ggf. 4 (rowNum) |
| 3–6 | 4 | **Cursor-ID** | 0 = Name-basiert |
| 7 | 1 | **Name-Länge** | *Nur wenn Cursor-ID = 0* |
| 8–… | n | **Cursor-Name** | *Nur wenn Cursor-ID = 0* |
| … | 1 | **Fetch-Typ** | Fetch-Richtung (siehe Tabelle) |
| … | 4 | **Zeilennummer** | *Nur bei Typ 5 (ABS) oder 6 (REL)* |

#### Fetch-Typen

| Wert | Konstante | Bedeutung |
|------|-----------|-----------|
| `1` | `CUR_NEXT` | Nächste Zeile(n) |
| `2` | `CUR_PREV` | Vorherige Zeile(n) |
| `3` | `CUR_FIRST` | Erste Zeile(n) |
| `4` | `CUR_LAST` | Letzte Zeile(n) |
| `5` | `CUR_ABS` | Absolute Position (+ 4 Byte Zeilennummer) |
| `6` | `CUR_REL` | Relative Position (+ 4 Byte Offset) |

---

### 1.6 CURCLOSE – Cursor schließen

**Quelldatei:** `CurCloseToken.java`  
**Token-Typ:** `0x80` (128)

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Token-Typ** | `0x80` (CURCLOSE) |
| 1–2 | 2 | **Gesamtlänge** | `5` + ggf. `1 + nameLen` |
| 3–6 | 4 | **Cursor-ID** | 0 = Name-basiert |
| 7 | 1 | **Name-Länge** | *Nur wenn Cursor-ID = 0* |
| 8–… | n | **Cursor-Name** | *Nur wenn Cursor-ID = 0* |
| … | 1 | **Dealloc-Flag** | `0x00` = nur schließen; `0x01` = auch freigeben |

---

### 1.7 CURDELETE – Aktuelle Zeile löschen

**Quelldatei:** `CurDeleteToken.java`  
**Token-Typ:** `0x81` (129)

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Token-Typ** | `0x81` (CURDELETE) |
| 1–2 | 2 | **Gesamtlänge** | `5` + ggf. Name + ggf. Tabellenname |
| 3–6 | 4 | **Cursor-ID** | 0 = Name-basiert |
| 7 | 1 | **Name-Länge** | *Nur wenn Cursor-ID = 0* |
| 8–… | n | **Cursor-Name** | *Nur wenn Cursor-ID = 0* |
| … | 1 | **Reserviert** | `0x00` |
| … | 1 | **Tabellen-Name-Länge** | 0 = kein Tabellenname |
| … | n | **Tabellenname** | *Nur wenn Länge > 0* |

Nach CURDELETE folgt immer ein **KEY-Token** (`0xCA`).

---

### 1.8 CURUPDATE – Aktuelle Zeile aktualisieren

**Quelldatei:** `CurUpdateToken.java`  
**Token-Typ:** `0x85` (133)

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Token-Typ** | `0x85` (CURUPDATE) |
| 1–2 | 2 | **Gesamtlänge** | `8 + tableLen + setLen` |
| 3–6 | 4 | **Cursor-ID** | Numerische Cursor-ID |
| 7 | 1 | **Status** | `0x00` = kein Parameter; `0x01` = Parameter folgen |
| 8 | 1 | **Tabellen-Name-Länge** | 0 = kein Tabellenname |
| 9–… | n | **Tabellenname** | *Nur wenn Länge > 0* |
| 9+n – 10+n | 2 | **SET-Klausel-Länge** | Byte-Länge der SET-Klausel |
| 11+n – … | m | **SET-Klausel** | z. B. `"col1=@p1, col2=@p2"` |

Nach CURUPDATE folgen: **KEY-Token** + ggf. **PARAMFMT** + **PARAMS** + Parameterdaten.

---

### 1.9 CURINFO – Cursor-Status / Fetch-Größe

**Quelldatei:** `CurInfoToken.java`  
**Token-Typ:** `0x83` (131) — `CurInfo3Token`: `0x88` (136)

#### Als Sende-Token (Client → Server)

Wird gesendet um die Fetch-Größe zu setzen oder den Status abzufragen.

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Token-Typ** | `0x83` (CURINFO) oder `0x88` (CURINFO3) |
| 1–2 | 2 | **Gesamtlänge** | `5 + statusLen` + ggf. `4` (bei Cmd=1) + ggf. Name |
| 3–6 | 4 | **Cursor-ID** | 0 = Name-basiert |
| 7 | 1 | **Name-Länge** | *Nur wenn Cursor-ID = 0* |
| 8–… | n | **Cursor-Name** | *Nur wenn Cursor-ID = 0* |
| … | 1 | **Command** | Befehlstyp (siehe Tabelle) |
| … | 2 oder 4 | **Status** | CurInfo: 2 Bytes; CurInfo3: 4 Bytes (immer 0 beim Senden) |
| … | 4 | **Fetch-Größe** | *Nur bei Command=1* — gewünschte Anzahl Zeilen pro Fetch |

#### Commands

| Wert | Konstante | Bedeutung |
|------|-----------|-----------|
| `1` | `CUR_SETCURROWS` | Fetch-Größe setzen (+ 4 Byte Wert) |
| `2` | `CUR_INQUIRE` | Aktuellen Status abfragen |
| `3` | `CUR_INFORM` | Status-Update empfangen (Server→Client) |
| `4` | `CUR_LISTALL` | Alle Cursors auflisten |

#### Als Empfangs-Token (Server → Client)

Der Server antwortet mit CURINFO/CURINFO3 nach CUROPEN, um die zugeteilte Cursor-ID mitzuteilen.

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 1–2 | 2 | Gesamtlänge | |
| 3–6 | 4 | **Cursor-ID** | Vom Server zugeteilte ID (danach für alle Token verwenden) |
| 7 | 1 | Name-Länge | *Nur wenn ID = 0* |
| … | 1 | Command | `3` = INFORM |
| … | 2 / 4 | **Status-Flags** | Cursor-Zustand (siehe Tabelle) |
| … | 4 | Metadaten | (bei CurInfo: rowCount; bei CurInfo3: rowNum + totalRowCount) |

#### CURINFO3 Empfang – Zusätzliche Metadaten

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| … | 4 | **Aktuelle Zeilennummer** | `_cursor._rowNum` |
| … | 4 | **Gesamtzeilenanzahl** | `_cursor._totalRowCount` |
| … | 4 | Reserviert | *Nur wenn Status-Bit 5 gesetzt* |

#### Status-Flags (Server-Antwort)

| Bit | Wert | Konstante | Bedeutung |
|-----|------|-----------|-----------|
| 0 | `1` | `CUR_IS_DECLARED` | Cursor ist deklariert |
| 1 | `2` | `CUR_IS_OPEN` | Cursor ist offen |
| 2 | `4` | `CUR_IS_CLOSED` | Cursor ist geschlossen |
| 3 | `8` | `CUR_IS_RDONLY` | Cursor ist schreibgeschützt |
| 4 | `16` | `CUR_IS_UPDATABLE` | Cursor ist aktualisierbar |
| 5 | `32` | `CUR_IS_ROWCNT` | Zeilenanzahl verfügbar |
| 6 | `64` | `CUR_IS_DALLOC` | Cursor wurde freigegeben |
| 7 | `128` | `CUR_IS_SCROLLABLE` | Cursor ist scrollbar |
| 8 | `256` | `CUR_IS_IMPLICIT` | Impliziter Cursor |
| 9 | `512` | `CUR_IS_SENSITIVE` | Sensitiver Cursor |
| 10 | `1024` | `CUR_IS_INSENSITIVE` | Insensitiver Cursor |
| 11 | `2048` | `CUR_IS_SEMISENSITIVE` | Semi-sensitiver Cursor |
| 12 | `4096` | `CUR_IS_KEYSETDRIVEN` | Keyset-gesteuerter Cursor |

---

### 1.10 KEY – Schlüsselspalten-Referenz

**Quelldatei:** `KeyToken.java`  
**Token-Typ:** `0xCA` (202)

Wird nach CURDELETE und CURUPDATE gesendet, um dem Server mitzuteilen, welche Spalten Schlüssel- oder Identity-Spalten sind.

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Token-Typ** | `0xCA` (KEY) |
| 1–… | var | **Spalten-Daten** | Pro Spalte mit Status-Bit `KEY(2)` oder `IDENTITY(4)`: DataFormat-Block |

Die Spalten werden aus dem ResultSet-Metadaten gelesen. Es werden nur Spalten gesendet, deren Status-Byte Bit 1 (`ROW_KEY`) oder Bit 2 (`ROW_VERSION`) gesetzt hat.

---

## 2. Capability Token

**Quelldatei:** `CapabilityToken.java`  
**Token-Typ:** `0xE2` (226)  
Wird direkt nach dem Login-Token gesendet (Client) und vom Server als Antwort gespiegelt.

### Byte-Sequenz (send)

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Token-Typ** | `0xE2` (CAPABILITY) |
| 1–2 | 2 | **Gesamtlänge** | `reqMaskLen + resMaskLen + 4` |
| **Request-Capability-Block:** | | | |
| 3 | 1 | **Typ** | `0x01` = Request-Capabilities |
| 4 | 1 | **Masken-Länge** | Standard: `14` Bytes (112 Bits, 106 genutzt) |
| 5 – 18 | 14 | **Request-Maske** | Bit-Maske, höchstes Bit zuerst |
| **Response-Capability-Block:** | | | |
| 19 | 1 | **Typ** | `0x02` = Response-Capabilities |
| 20 | 1 | **Masken-Länge** | Standard: `10` Bytes (80 Bits, 73 genutzt) |
| 21 – 30 | 10 | **Response-Maske** | Bit-Maske, höchstes Bit zuerst |

### Masken-Längen je TDS-Version

| TDS-Version | Req-Maskenbits | Res-Maskenbits | Maskenlänge (Bytes) | Gesamtlänge |
|-------------|---------------|----------------|---------------------|-------------|
| ≥ 7.0 | 106 | 73 | 14 / 10 | 28 |
| ≥ 6.05 | 90 | 59 | 12 / 8 | 24 |
| ≥ 6.0 | 73 | 52 | 10 / 7 | 21 |
| ≥ 4.0 | 57 | 39 | 8 / 5 | 17 |

### Bit-Codierung der Maske

Bits werden **von Bit `maskLen*8 - 1` abwärts zu Bit 0** serialisiert. Jede Gruppe von 8 Bits ergibt ein Byte. Bit-Position `n` befindet sich in Byte `(maskLen-1) - n/8` an Bit-Stelle `n % 8`.

### Request-Capability-Bits (Auswahl)

| Bit | Konstante | Client fordert an... |
|-----|-----------|----------------------|
| 1 | `REQ_LANG` | LANGUAGE-Token |
| 2 | `REQ_RPC` | RPC-Ausführung |
| 5 | `REQ_BCP` | Bulk Copy |
| 6 | `REQ_CURSOR` | Server-Cursor |
| 7 | `REQ_DYNF` | Prepared Statements (DYNAMIC) |
| 8 | `REQ_MSG` | MSG-Token |
| 47 | `PROTO_DYNAMIC` | DYNAMIC-Protokoll |
| 51 | `DATA_INT8` | 64-Bit-Integer |
| 59 | `WIDETABLE` | DYNAMIC2/PARAMFMT2 |
| 79 | `REQ_SRVPKTSIZE` | Server-Paketgröße aushandeln |
| 80 | `DATA_UNITEXT` | Unicode-Text |
| 81 | `CAP_CLUSTERFAILOVER` | Cluster-Failover |
| 86 | `REQ_CURINFO3` | CURINFO3-Token |
| 87 | `REQ_DBRPC2` | Erweitertes DBRPC |
| 89 | `REQ_MIGRATE` | Connection Migration |
| 90 | `MULTI_REQUESTS` | Mehrere Requests im Paket |
| 98 | `REQ_DYN_BATCH` | Batch-Parameter für DYNAMIC |
| 99 | `REQ_LANG_BATCH` | Batch-Parameter für LANGUAGE |
| 106 | `REQ_COMMAND_ENCRYPTION` | Befehls-Verschlüsselung |

### Response-Capability-Bits (Auswahl, Client setzt = "Server soll NICHT senden")

| Bit | Konstante | Client lehnt ab... |
|-----|-----------|-------------------|
| 27 | `CON_NOOOB` | Out-of-Band-Daten |
| 30 | `PROTO_NOBULK` | Bulk-Protokoll |
| 33 | `RES_NOTDSDEBUG` | TDS-Debug-Informationen |
| 34 | `RES_NOSTRIPBLANKS` | Blank-Stripping (wenn nicht gewünscht) |
| 47 | `IMAGE_NONCHAR` | IMAGE-als-NCHAR |
| 49 | `BLOB_NONCHAR_8` | BLOB-als-NCHAR-8 |
| 50 | `BLOB_NONCHAR_SCSU` | BLOB-als-NCHAR-SCSU |
| 58 | `NO_SRVPKTSIZE` | Server-Paketgröße (wenn BCP inaktiv) |
| 62 | `RES_SUPPRESS_FMT` | ROWFMT-Unterdrückung |
| 63 | `RES_SUPPRESS_DONEINPROC` | DONEINPROC-Unterdrückung |
| 64 | `RES_FORCE_ROWFMT2` | ROWFMT2 erzwingen |
| 67 | `RES_NO_TDSCONTROL` | TDS-Control |
| 72 | `RES_LIST_DR_MAP` | DR-Map-Informationen |
| 73 | `RES_DR_NOKILL` | DR-Kill-Verhalten |

---

## 3. Session-Management

### 3.1 LOGOUT – Verbindung beenden

**Quelldatei:** `LogoutToken.java`  
**Token-Typ:** `0x71` (113)  
**PDU-Typ:** `0x0D` (BUF_LOGOUT)

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Token-Typ** | `0x71` (LOGOUT) |
| 1 | 1 | **Optionen** | `0x00` (immer 0) |

---

### 3.2 OPTIONCMD – Server-Optionen setzen

**Quelldatei:** `OptionCmdToken.java`  
**Token-Typ:** `0xA6` (166)

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Token-Typ** | `0xA6` (OPTIONCMD) |
| 1–2 | 2 | **Gesamtlänge** | `3 + Wertgröße` |
| 3 | 1 | **Anzahl Optionen** | `0x01` (immer 1) |
| 4 | 1 | **Option-ID** | Siehe Tabelle |
| 5 | 1 | **Wert-Größe** | Byte-Größe des Werts |
| 6–… | 1/2/4 | **Wert** | Abhängig von Option |

#### Option-IDs und Wertgrößen

| Option-ID | Hex | Konstante | Wertgröße | Bedeutung |
|-----------|-----|-----------|-----------|-----------|
| `2` | `0x02` | `OPT_TEXTSIZE` | 4 Bytes (Int) | Max. Textgröße in Bytes |
| `5` | `0x05` | `OPT_ROWCOUNT` | 4 Bytes (Int) | Max. Zeilenanzahl (SET ROWCOUNT) |
| `8` | `0x08` | `OPT_ISOLATION` | 1 Byte | Transaktions-Isolationsstufe |
| `25` | `0x19` | `OPT_CHAINXACTS` | 1 Byte | `0x01` = Implicit Transactions an |
| `35` | `0x23` | `OPT_QUOTED_IDENT` | 1 Byte | `0x01` = Quoted Identifiers an |
| `49` | `0x31` | `OPT_LOB_LOCATOR` | 1 Byte | LOB-Locator-Modus |
| `52` | `0x34` | `OPT_ISOLATION_MODE` | 1 Byte | Erweiterte Isolationsstufe |

---

### 3.3 MSG – Nachricht / Security-Handshake

**Quelldatei:** `MsgToken.java`  
**Token-Typ:** `0x65` (101)

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Token-Typ** | `0x65` (MSG) |
| 1 | 1 | **Länge** | `0x03` (immer 3) |
| 2 | 1 | **Status** | Message-Kategorie (siehe Tabelle) |
| 3–4 | 2 | **Message-ID** | Spezifische Nachricht |

#### MSG-Typen (Status-Byte)

| Wert | Konstante | Richtung | Bedeutung |
|------|-----------|----------|-----------|
| `1` | `MSG_SEC_ENCRYPT` | C→S | Passwort-Verschlüsselung anfordern |
| `2` | `MSG_SEC_LOGPWD` | S→C | Verschlüsseltes Passwort (Stufe 1) |
| `3` | `MSG_SEC_REMPWD` | S→C | Verschlüsseltes Remote-Passwort |
| `4` | `MSG_SEC_CHALLENGE` | S→C | Challenge für Passwort-Hashing |
| `5` | `MSG_SEC_RESPONSE` | C→S | Response auf Challenge |
| `11` | `MSG_SEC_OPAQUE` | beide | Undurchsichtiges Security-Token |
| `12` | `MSG_HAFAILOVER` | S→C | HA-Failover-Benachrichtigung |
| `13` | `MSG_EMPTY` | beide | Leere Nachricht / Ping |
| `14` | `MSG_SEC_ENCRYPT2` | C→S | Verschlüsselung Stufe 2 |
| `15` | `MSG_SEC_LOGPWD2` | S→C | Verschlüsseltes Passwort (Stufe 2) |
| `16` | `MSG_SEC_SUP_CIPHER` | S→C | Unterstützte Cipher-Suiten |
| `17` | `MSG_MIG_REQ` | C→S | Migration anfordern |
| `18` | `MSG_MIG_SYNC` | S→C | Migration synchronisieren |
| `19` | `MSG_MIG_CONT` | C→S | Migration fortsetzen |
| `21` | `MSG_MIG_FAIL` | S→C | Migration fehlgeschlagen |
| `22` | `MSG_SEC_REMPWD2` | S→C | Remote-Passwort Stufe 2 |
| `30` | `MSG_SEC_ENCRYPT3` | C→S | Verschlüsselung Stufe 3 |
| `31` | `MSG_SEC_LOGPWD3` | S→C | Verschlüsseltes Passwort (Stufe 3) |
| `33` | `MSG_DR_MAP` | S→C | Disaster-Recovery-Mapping |
| `34` | `MSG_SEC_SYMKEY` | beide | Symmetrischer Schlüssel |
| `35` | `MSG_SEC_ENCRYPT4` | C→S | Verschlüsselung Stufe 4 |

---

## 4. Server-Antwort-Token (nur empfangen)

---

### 4.1 LOGINACK – Login-Bestätigung

**Token-Typ:** `0xAD` (173)  
**Quelldatei:** `LoginAckToken.java`

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 1–2 | 2 | **Gesamtlänge** | Gesamt-Body-Länge |
| 3 | 1 | **Status** | Login-Ergebnis (siehe Tabelle) |
| 4–7 | 4 | **TDS-Version** | `[Major, Minor, Patch, Build]` des Servers |
| 8 | 1 | **Programm-Name-Länge** | Byte-Länge des Servernamens |
| 9–… | n | **Programm-Name** | z. B. `"ASE"`, `"sql server"` |
| 9+n – 12+n | 4 | **Programm-Version** | `[Major, Minor, Patch, Build]` |

#### Login-Status-Werte

| Wert | Hex | Konstante | Bedeutung |
|------|-----|-----------|-----------|
| `5` | `0x05` | `LOG_SUCCEED` | Login erfolgreich |
| `6` | `0x06` | `LOG_FAIL` | Login fehlgeschlagen |
| `7` | `0x07` | `LOG_NEGOTIATE` | Security-Aushandlung notwendig |
| `133` | `0x85` | `LOG_SECSESS_ACK + SUCCEED` | Kerberos-Login erfolgreich |
| `134` | `0x86` | `LOG_SECSESS_ACK + FAIL` | Kerberos-Login fehlgeschlagen |
| `135` | `0x87` | `LOG_SECSESS_ACK + NEGOTIATE` | Kerberos-Aushandlung |

---

### 4.2 DONE / DONEPROC / DONEINPROC – Befehl abgeschlossen

**Quelldatei:** `DoneToken.java`  
**Token-Typen:** `0xFD` (253=DONE), `0xFE` (254=DONEPROC), `0xFF` (255=DONEINPROC)

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 1–2 | 2 | **Status-Flags** | Bit-Flags (siehe Tabelle) |
| 3–4 | 2 | **Transaktions-Status** | `TRAN_PROGRESS(2)` = Transaktion aktiv |
| 5–8 | 4 | **Zeilenanzahl** | Anzahl betroffener Zeilen (gültig wenn `DONE_COUNT` gesetzt) |

**Gesamt: 9 Bytes** (inkl. Token-Byte)

#### DONE Status-Flags

| Bit | Wert | Konstante | Bedeutung |
|-----|------|-----------|-----------|
| 0 | `1` | `DONE_MORE` | Weitere Ergebnisse folgen |
| 1 | `2` | `DONE_ERROR` | Fehler aufgetreten |
| 2 | `4` | `DONE_INXACT` | Transaktion aktiv |
| 3 | `8` | `DONE_PROC` | Stored Procedure abgeschlossen |
| 4 | `16` | `DONE_COUNT` | Zeilenanzahl ist gültig |
| 5 | `32` | `DONE_ATTN` | Attention/Cancel bestätigt |
| 6 | `64` | `DONE_EVENT` | Event-Benachrichtigung |

---

### 4.3 EED – Erweiterte Fehlermeldung

**Token-Typ:** `0xE5` (229)  
**Quelldatei:** `EedToken.java`

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 1–2 | 2 | **Gesamtlänge** | Body-Länge |
| 3–6 | 4 | **Fehlernummer** | Server-Fehlernummer (z. B. 208 = Tabelle nicht gefunden) |
| 7 | 1 | **State** | Fehler-State (0–255) |
| 8 | 1 | **Schweregrad** | 1–10 = Information; 11–16 = Fehler; 17–25 = schwerer Fehler |
| 9 | 1 | **SQL-State-Länge** | Byte-Länge des SQL-States |
| 10–… | n | **SQL-State** | ANSI-SQL-Zustandscode, z. B. `"S0002"` |
| 10+n | 1 | **Status** | `0x00` = kein EED folgt; `0x01` = weiterer EED folgt; `0x02` = Info |
| 11+n – 12+n | 2 | **Transaktions-State** | |
| 13+n – 14+n | 2 | **Nachricht-Länge** | Byte-Länge der Fehlermeldung |
| 15+n – … | m | **Fehlermeldung** | Lesbarer Fehlertext |
| 15+n+m | 1 | **Server-Name-Länge** | |
| … | s | **Servername** | Name des Datenbankservers |
| … | 1 | **Prozedur-Name-Länge** | 0 = nicht in einer Prozedur |
| … | p | **Prozedurname** | Name der SP (falls vorhanden) |
| … | 2 | **Zeilennummer** | Zeile im SQL-Batch oder in der SP |

---

### 4.4 ENVCHANGE – Umgebungsänderung

**Token-Typ:** `0xE3` (227)  
**Quelldatei:** `EnvChangeToken.java`

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 1–2 | 2 | **Gesamtlänge** | Gesamt-Länge aller Einträge |
| **Pro Eintrag (wiederholt):** | | | |
| 3 | 1 | **Umgebungstyp** | Typ der Änderung (siehe Tabelle) |
| 4 | 1 | **Neuwert-Länge** | Byte-Länge des neuen Werts |
| 5–… | n | **Neuer Wert** | z. B. `"pubs2"` (neue Datenbank) |
| 5+n | 1 | **Altwert-Länge** | Byte-Länge des alten Werts |
| 6+n–… | m | **Alter Wert** | z. B. `"master"` (vorherige Datenbank) |

#### Umgebungstypen

| Wert | Konstante | Bedeutung |
|------|-----------|-----------|
| `1` | `ENV_DB` | Datenbank wurde gewechselt (USE ...) |
| `2` | `ENV_LANG` | Sprache geändert |
| `3` | `ENV_CHARSET` | Zeichensatz geändert |
| `4` | `ENV_PACKETSIZE` | TDS-Paketgröße neu ausgehandelt |

---

### 4.5 ROWFMT / ROWFMT2 – Spalten-Metadaten

**Token-Typen:** `0xEE` (238=ROWFMT), `0x61` (97=ROWFMT2)  
**Quelldatei:** `RowFormatToken.java`, `RowFormat2Token.java`

Wird nach jeder SELECT-Query oder nach dem ersten CURFETCH gesendet.

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 1–2 | 2 | **Länge** | Gesamt-Länge der Format-Daten |
| 3–4 | 2 | **Spaltenanzahl** | Anzahl der Ergebnis-Spalten |
| **Pro Spalte (DataFormat-Block):** | | | |
| … | 1 | **Name-Länge** | Byte-Länge des Spaltennamens |
| … | n | **Spaltenname** | |
| … | 1 | **Status** | Spalten-Eigenschaften (ROW_*-Flags) |
| … | 4 | **User-Typ** | |
| … | 1 | **Datentyp** | TDS-Datentyp-Code |
| … | var | **Längenfeld** | Typ-abhängig (0–4 Bytes) |
| … | 1 | **Locale-Länge** | 0 = kein Locale |
| … | n | **Locale** | |

#### Spalten-Status-Flags (ROW_*)

| Bit | Wert | Konstante | Bedeutung |
|-----|------|-----------|-----------|
| 0 | `1` | `ROW_HIDDEN` | Spalte ist versteckt |
| 1 | `2` | `ROW_KEY` | Schlüsselspalte |
| 2 | `4` | `ROW_VERSION` | Versions-/Timestamp-Spalte |
| 3 | `8` | `ROW_COLUMNSTATUS` | Status-Byte pro Wert vorhanden |
| 4 | `16` | `ROW_UPDATABLE` | Spalte ist aktualisierbar |
| 5 | `32` | `ROW_NULLALLOWED` | Spalte erlaubt NULL |
| 6 | `64` | `ROW_IDENTITY` | Identity-Spalte |

---

### 4.6 ROW – Datenzeile

**Token-Typ:** `0xD1` (209)  
**Quelldatei:** `RowToken.java`

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Token-Typ** | `0xD1` (ROW) |
| **Pro Spalte (gemäß ROWFMT):** | | | |
| … | var | **Spaltenwert** | Format laut DataFormat-Block |

Für Typen mit Längenfeld: Länge vorangestellt, dann Wert-Bytes.  
Für fixe Typen: Wert direkt ohne Längenfeld.  
NULL-Werte: Bei Typen mit Längenfeld = `0x00`; bei fixen Typen per Column-Status-Byte.

---

### 4.7 ALTFMT / ALTROW – Aggregat-Ergebnisse

**Token-Typen:** `0xA8` (168=ALTFMT), `0xD3` (211=ALTROW)  
**Quelldatei:** `AltFormatToken.java`, `AltRowToken.java`

Folgen nach regulären ROW-Daten bei Aggregat-Abfragen (GROUP BY, COMPUTE).

#### Aggregat-Funktion-Codes

| Code | Konstante | Funktion |
|------|-----------|----------|
| `75` | `ALT_COUNT` | COUNT |
| `77` | `ALT_SUM` | SUM |
| `79` | `ALT_AVG` | AVG |
| `81` | `ALT_MIN` | MIN |
| `82` | `ALT_MAX` | MAX |
| `97` | `ALT_COUNTBG` | COUNT_BIG |

---

## 5. Vollständige Sequenz-Beispiele

### 5.1 Server-Cursor mit Parametern öffnen und lesen

```
┌────────────────────────────────────────────────────────┐
│  [TDS Header: BUF_LANG]                                │
│  CURDECLARE3  (0x10)                                   │
│    Token-Typ, Länge (4B), Name-Länge, Name,            │
│    Cursor-Typ (4B), hasArgs=1,                         │
│    SQL-Länge (4B), SQL-Text,                           │
│    Spaltenanzahl (2B)                                  │
│  CURINFO  (0x83)          ← Fetch-Größe setzen         │
│    Token-Typ, Länge, Cursor-ID=0, Name,                │
│    Cmd=1, Status=0, FetchSize=50                       │
│  CUROPEN  (0x84)                                       │
│    Token-Typ, Länge, Cursor-ID=0, Name, hasArgs=1      │
│  PARAMFMT  (0xEC)                                      │
│    Token-Typ, Länge, ParamCount, [DataFormat...]       │
│  PARAMS  (0xD7)                                        │
│  [Parameterdaten]                                      │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  [TDS Header: BUF_RESPONSE]  (Server)                  │
│  CURINFO  (0x83)          ← Cursor-ID zuteilen         │
│    Cursor-ID = 42, Cmd=3, Status=CUR_IS_OPEN(2)        │
│  DONE  (0xFD)                                          │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  [TDS Header: BUF_LANG]   (Client — Zeilen holen)      │
│  CURFETCH  (0x82)                                      │
│    Token-Typ, Länge, Cursor-ID=42, Typ=NEXT(1)         │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  [TDS Header: BUF_RESPONSE]  (Server)                  │
│  ROWFMT  (0xEE)           ← nur beim ersten Fetch      │
│  ROW (0xD1) × 50          ← Batch-Daten               │
│  DONE (0xFD)  DONE_COUNT=50, DONE_MORE=1               │
└────────────────────────────────────────────────────────┘
```

### 5.2 Positioniertes Update mit Schlüsselspalten

```
┌────────────────────────────────────────────────────────┐
│  [TDS Header: BUF_LANG]                                │
│  CURUPDATE  (0x85)                                     │
│    Cursor-ID, Status=1, Tabellenname, SET-Klausel      │
│  KEY  (0xCA)                                           │
│    DataFormat-Blocks der Schlüsselspalten              │
│  PARAMFMT  (0xEC)                                      │
│  PARAMS  (0xD7)                                        │
│  [Parameterdaten für SET-Klausel]                      │
└────────────────────────────────────────────────────────┘
```

### 5.3 Session-Setup nach Login

```
┌────────────────────────────────────────────────────────┐
│  [TDS Header: BUF_LANG]                                │
│  OPTIONCMD  (0xA6)  OPT_TEXTSIZE=2097152               │
│  OPTIONCMD  (0xA6)  OPT_ISOLATION=1                    │
│  OPTIONCMD  (0xA6)  OPT_QUOTED_IDENT=1                 │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  [TDS Header: BUF_RESPONSE]                            │
│  ENVCHANGE  (0xE3)  ENV_DB: "master"→"mydb"            │
│  ENVCHANGE  (0xE3)  ENV_PACKETSIZE: "512"→"4096"       │
│  DONE  (0xFD)                                          │
└────────────────────────────────────────────────────────┘
```

### 5.4 Vollständige Verbindungsbeendigung

```
┌────────────────────────────────────────────────────────┐
│  [TDS Header: BUF_LANG]                                │
│  CURCLOSE  (0x80)   dealloc=1   ← offene Cursors       │
│  LOGOUT    (0x71)   options=0   ← Session beenden      │
└────────────────────────────────────────────────────────┘
```

---

## 6. Token-ID Schnellreferenz (alle Token)

| Hex | Dez | Token | Richtung |
|-----|-----|-------|----------|
| `0x10` | 16 | CURDECLARE3 | C→S |
| `0x20` | 32 | PARAMFMT2 | C→S |
| `0x21` | 33 | LANGUAGE | C→S |
| `0x23` | 35 | CURDECLARE2 | C→S |
| `0x62` | 98 | DYNAMIC2 | C→S |
| `0x65` | 101 | MSG | beide |
| `0x71` | 113 | LOGOUT | C→S |
| `0x79` | 121 | RETURNSTATUS | S→C |
| `0x7B` | 123 | RETURNVALUE | S→C |
| `0x80` | 128 | CURCLOSE | C→S |
| `0x81` | 129 | CURDELETE | C→S |
| `0x82` | 130 | CURFETCH | C→S |
| `0x83` | 131 | CURINFO | beide |
| `0x84` | 132 | CUROPEN | C→S |
| `0x85` | 133 | CURUPDATE | C→S |
| `0x86` | 134 | CURDECLARE | C→S |
| `0x88` | 136 | CURINFO3 | beide |
| `0xA6` | 166 | OPTIONCMD | C→S |
| `0xA8` | 168 | ALTFMT | S→C |
| `0xAD` | 173 | LOGINACK | S→C |
| `0xCA` | 202 | KEY | C→S |
| `0xD1` | 209 | ROW | S→C |
| `0xD3` | 211 | ALTROW | S→C |
| `0xD7` | 215 | PARAMS | C→S |
| `0xE0` | 224 | RPC | C→S |
| `0xE2` | 226 | CAPABILITY | beide |
| `0xE3` | 227 | ENVCHANGE | S→C |
| `0xE5` | 229 | EED | S→C |
| `0xE6` | 230 | DBRPC | C→S |
| `0xE7` | 231 | DYNAMIC | C→S |
| `0xEB` | 235 | ORDERBY | S→C |
| `0xEC` | 236 | PARAMFMT | C→S |
| `0xEE` | 238 | ROWFMT | S→C |
| `0xE9` | 233 | TABNAME | S→C |
| `0xFD` | 253 | DONE | S→C |
| `0xFE` | 254 | DONEPROC | S→C |
| `0xFF` | 255 | DONEINPROC | S→C |
