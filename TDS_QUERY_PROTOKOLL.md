# TDS 5.0 Query & Prepared Statement – Protokoll-Dokumentation (jConn4)

Quellen: `com/sybase/jdbc4/tds/LanguageToken.java`, `DynamicToken.java`, `Dynamic2Token.java`,
`DbrpcToken.java`, `ParamFormatToken.java`, `ParamFormat2Token.java`,
`DataFormat.java`, `ParamDataFormat2.java`, `ParamsToken.java`, `TdsConst.java`

---

## Übersicht: Token-Typen

| Token | Hex | Dez | PDU-Typ | Verwendung |
|-------|-----|-----|---------|------------|
| `LANGUAGE` | `0x21` | 33 | `BUF_LANG (1)` | Einfache SQL-Query |
| `DYNAMIC` | `0xE7` | 231 | `BUF_LANG (1)` | Prepared Statement (≤ 32 KB) |
| `DYNAMIC2` | `0x62` | 98 | `BUF_LANG (1)` | Prepared Statement (> 32 KB) |
| `DBRPC` | `0xE6` | 230 | `BUF_RPC (3)` | Stored Procedure Call |
| `PARAMFMT` | `0xEC` | 236 | — | Parameter-Format (≤ 64 KB) |
| `PARAMFMT2` | `0x20` | 32 | — | Parameter-Format (> 64 KB) |
| `PARAMS` | `0xD7` | 215 | — | Parameter-Daten-Marker |

---

## TDS Netzwerk-Header (8 Bytes)

Jedes Paket beginnt mit diesem Header (geschrieben von `PduOutputFormatter`):

| Byte | Größe | Feld | Wert |
|------|-------|------|------|
| 0 | 1 | **PDU-Typ** | `0x01` = BUF_LANG (Query/Prepared); `0x03` = BUF_RPC (Stored Proc) |
| 1 | 1 | **Status** | `0x01` = letztes Paket (EOM); `0x00` = weitere Pakete folgen |
| 2–3 | 2 | **Paketlänge** | Gesamtlänge inkl. Header, Big-Endian |
| 4–5 | 2 | **Channel** | `0x00 0x00` |
| 6 | 1 | **Paketnummer** | Sequenznummer ab 1 |
| 7 | 1 | **Window** | `0x00` |

---

## 1. Einfache SQL-Query (LANGUAGE Token)

**PDU-Typ:** `0x01` (BUF_LANG)  
**Quelldatei:** `LanguageToken.java`

### Byte-Sequenz

```
[TDS Header 8 Bytes] [LANGUAGE Token Body]
```

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Token-Typ** | `0x21` (33 = LANGUAGE) |
| 1–4 | 4 | **Body-Länge** | `queryBytes.length + 1` (Status-Byte inkludiert); Big-Endian |
| 5 | 1 | **Status-Flags** | Bit-Flags (siehe unten) |
| 6–n | n | **SQL-Text** | Query als Byte-Array (Encoding abhängig von Verbindungscharset) |

### Status-Flags (Byte 5)

| Bit | Wert | Konstante | Bedeutung |
|-----|------|-----------|-----------|
| 0 | `0x01` | `LANG_HASARGS` | Parameter folgen nach dem Token |
| 2 | `0x04` | `LANG_BATCH_PARAMS` | Batch-Parameter-Modus aktiv |

### Beispiel: `SELECT * FROM users WHERE id = 42`

```
21                   Token-Typ: LANGUAGE
00 00 00 25          Body-Länge: 37 (1 Status + 36 Query-Bytes)
00                   Status: keine Parameter
53 45 4C 45 43 54... SQL-Text: "SELECT * FROM users WHERE id = 42"
```

### Hinweis: Parameter bei einfachen Queries

Bei `Statement` (nicht `PreparedStatement`) werden Parameter **als SQL-Literale** direkt in den Query-Text eingebettet. Es gibt keine separaten PARAMFMT/PARAMS-Token.

---

## 2. Prepared Statement (DYNAMIC Token)

**PDU-Typ:** `0x01` (BUF_LANG)  
**Quelldatei:** `DynamicToken.java`

Ein Prepared Statement durchläuft drei Phasen: **PREPARE → EXECUTE → DEALLOC**

---

### Phase 1: PREPARE (Statement vorbereiten)

Sendet DYNAMIC(PREPARE) + PARAMFMT:

#### DYNAMIC Token – PREPARE

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Token-Typ** | `0xE7` (231 = DYNAMIC) |
| 1–2 | 2 | **Gesamtlänge** | `3 + nameLen + 2 + bodyLen`; Big-Endian (Short) |
| 3 | 1 | **Operationstyp** | `0x01` = PREPARE |
| 4 | 1 | **Status-Flags** | Bit-Flags (siehe unten) |
| 5 | 1 | **Name-Länge** | Byte-Länge des Statement-Namens |
| 6–(5+nameLen) | n | **Statement-Name** | Eindeutiger Bezeichner, z. B. `"stmt_1"` |
| 6+nameLen – 7+nameLen | 2 | **SQL-Länge** | Byte-Länge des SQL-Texts (Short) |
| 8+nameLen – … | n | **SQL-Text** | Parameterisiertes SQL, z. B. `"SELECT ? FROM t"` |

#### Status-Flags (Byte 4) – DYNAMIC

| Bit | Wert | Konstante | Bedeutung |
|-----|------|-----------|-----------|
| 0 | `0x01` | `DYN_HASARGS` | Parameter folgen |
| 1 | `0x02` | `DYN_SUPPRESS_ROWFMT` | Server soll ROWFMT unterdrücken |
| 2 | `0x04` | `DYN_BATCH_PARAMS` | Batch-Parameter |
| 3 | `0x08` | `DYN_SUPPRESS_PARAMFMT` | Server soll PARAMFMT unterdrücken |

#### Operationstypen (Byte 3)

| Wert | Hex | Konstante | Bedeutung |
|------|-----|-----------|-----------|
| 1 | `0x01` | `PREPARE` | Statement vorbereiten |
| 2 | `0x02` | `EXEC` | Vorbereitetes Statement ausführen |
| 4 | `0x04` | `DEALLOC` | Statement freigeben |
| 8 | `0x08` | `EXEC_IMMED` | Direkt ausführen (ohne Prepare-Schritt) |
| 32 | `0x20` | `ACK` | Bestätigung (Server → Client) |

---

#### PARAMFMT Token (folgt direkt nach DYNAMIC bei PREPARE)

Beschreibt Anzahl und Format aller Parameter. Quelldatei: `ParamFormatToken.java`

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Token-Typ** | `0xEC` (236 = PARAMFMT) |
| 1–2 | 2 | **Format-Länge** | `2 + Σ(DataFormat.length())`; max. 65535 |
| 3–4 | 2 | **Parameteranzahl** | Anzahl der Parameter (Short) |
| 5–… | var | **DataFormat[] ** | Ein DataFormat-Block pro Parameter |

#### DataFormat-Block (pro Parameter, `DataFormat.send()`)

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Name-Länge** | Byte-Länge des Parameternamens (0 = kein Name) |
| 1–n | n | **Parametername** | Name-Bytes (entfällt bei Länge 0) |
| n+1 | 1 | **Status** | Bit-Flags (siehe unten) |
| n+2 – n+5 | 4 | **User-Typ** | Benutzerdefinierter Typ (`usertype`), meist `0` |
| n+6 | 1 | **Datentyp** | TDS-Datentyp-Code (siehe Typ-Tabelle) |
| n+7 – … | var | **Längenfeld** | Typ-abhängig (0–4 Bytes, siehe Längenfeld-Tabelle) |
| … | 1 | **Locale-Länge** | Byte-Länge des Locale-Strings (0 = kein Locale) |
| … | n | **Locale** | Locale-String-Bytes (entfällt bei Länge 0) |

#### Status-Flags im DataFormat-Block

| Bit | Wert | Konstante | Bedeutung |
|-----|------|-----------|-----------|
| 0 | `0x01` | `PARAM_RETURN` | Registrierter/deklarierter Typ vorhanden |
| 3 | `0x08` | `PARAM_COLUMNSTATUS` | Column-Status-Byte folgt bei Datenwerten |
| 5 | `0x20` | `PARAM_NULLALLOWED` | Wert ist NULL |

#### Längenfeld im DataFormat je Datentyp

| Größe | Datentypen |
|-------|-----------|
| **0 Bytes** (Länge implizit) | INT1(48), BIT(50), INT2(52), INT4(56), DATE(49), TIME(51), SHORTDATE(58), FLT4(59), MONEY(60), DATETIME(61), FLT8(62), UINT2(65), UINT4(66), UINT8(67), SHORTMONEY(122), INT8(191) |
| **1 Byte** (max. Länge) | VARBINARY(37), INTN(38), VARCHAR(39), BINARY(45), CHAR(47), UINTN(68), SENSITIVITY(103), BOUNDARY(104), FLTN(109), MONEYN(110), DATETIMN(111), DATEN(123), TIMEN(147) |
| **1+1+1 Bytes** (len, precision, scale) | DECN(106), NUMN(108) |
| **1+1 Bytes** (len, scale) | BIGDATETIMEN(187), BIGTIMEN(188) |
| **4 Bytes** (max. Länge) | IMAGE(34), TEXT(35), UNITEXT(174), LONGCHAR(175), LONGBINARY(225) |

#### Blob-Typ (BLOB = 36) – Sonderfall

Nach dem Datentyp-Byte (`0x24`) folgt:

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **BLOB-Untertyp** | 1=JavaObject, 3=VARCHAR, 4=VARBINARY, 5=UTF16, 6=LOCATOR_TEXT, 7=LOCATOR_IMAGE, 8=LOCATOR_UNITEXT |
| 1–2 | 2 | **ClassID-Länge** | Länge der Klassen-ID / Reserviert |
| 3–… | n | **ClassID-Bytes** | Nur bei JavaObject (Untertyp 1) |

---

### Phase 2: EXECUTE (Statement ausführen)

Sendet DYNAMIC(EXEC) + PARAMS + [Parameterdaten]:

#### DYNAMIC Token – EXECUTE

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Token-Typ** | `0xE7` (231 = DYNAMIC) |
| 1–2 | 2 | **Gesamtlänge** | `3 + nameLen + 2` (kein SQL-Body) |
| 3 | 1 | **Operationstyp** | `0x02` = EXEC |
| 4 | 1 | **Status-Flags** | `0x01` wenn Parameter vorhanden |
| 5 | 1 | **Name-Länge** | Byte-Länge des Statement-Namens |
| 6–… | n | **Statement-Name** | Muss identisch zu PREPARE sein |
| 6+n – 7+n | 2 | **SQL-Länge** | `0x00 0x00` (leer – kein SQL nötig) |

#### PARAMS Token (Marker)

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Token-Typ** | `0xD7` (215 = PARAMS) – nur dieses eine Byte, kein weiterer Inhalt |

Nach dem PARAMS-Token folgen direkt die rohen Parameterwerte als Byte-Strom (ohne weiteren Header).

---

### Phase 3: DEALLOC (Statement freigeben)

#### DYNAMIC Token – DEALLOC

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Token-Typ** | `0xE7` (231 = DYNAMIC) |
| 1–2 | 2 | **Gesamtlänge** | `3 + nameLen + 2` |
| 3 | 1 | **Operationstyp** | `0x04` = DEALLOC |
| 4 | 1 | **Status-Flags** | `0x00` (keine Parameter) |
| 5 | 1 | **Name-Länge** | Byte-Länge des Statement-Namens |
| 6–… | n | **Statement-Name** | Zu löschendes Statement |
| 6+n – 7+n | 2 | **SQL-Länge** | `0x00 0x00` |

---

## 3. Große Statements: DYNAMIC2 Token

**Quelldatei:** `Dynamic2Token.java`  
Verwendet wenn Statement-Name oder SQL-Body > 32.767 Bytes.  
Identischer Aufbau wie DYNAMIC, aber mit **4-Byte-Längenfeldern**:

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Token-Typ** | `0x62` (98 = DYNAMIC2) |
| 1–4 | **4** | **Gesamtlänge** | Unsigned Int (statt 2-Byte Short) |
| 5 | 1 | **Operationstyp** | PREPARE(1), EXEC(2), DEALLOC(4), EXEC_IMMED(8) |
| 6 | 1 | **Status-Flags** | Identisch zu DYNAMIC |
| 7 | 1 | **Name-Länge** | Byte-Länge des Statement-Namens |
| 8–… | n | **Statement-Name** | |
| 8+n – 11+n | **4** | **SQL-Länge** | Unsigned Int (statt 2-Byte Short) |
| 12+n – … | n | **SQL-Text** | |

---

## 4. Großes Parameter-Format: PARAMFMT2 Token

**Quelldatei:** `ParamFormat2Token.java`  
Verwendet wenn die Format-Daten > 65.535 Bytes groß sind.

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Token-Typ** | `0x20` (32 = PARAMFMT2) |
| 1–4 | **4** | **Format-Länge** | Unsigned Int (statt 2-Byte Short); max. 4.294.967.295 |
| 5–6 | 2 | **Parameteranzahl** | Anzahl der Parameter (Short) |
| 7–… | var | **ParamDataFormat2[]** | Ein Block pro Parameter |

#### ParamDataFormat2 – Unterschied zu DataFormat

**Quelldatei:** `ParamDataFormat2.java`

Der Status wird als **4-Byte INT** statt 1-Byte geschrieben:

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Name-Länge** | wie DataFormat |
| 1–n | n | **Parametername** | wie DataFormat |
| n+1 – n+4 | **4** | **Status** | `writeInt(status)` (statt `writeByte`) |
| n+5 – n+8 | 4 | **User-Typ** | wie DataFormat |
| n+9 | 1 | **Datentyp** | wie DataFormat |
| n+10–… | var | **Längenfeld** | wie DataFormat |
| … | 1+n | **Locale** | wie DataFormat |

**Fixed-Length-Part:** 11 Bytes (vs. 8 bei DataFormat)

---

## 5. Stored Procedure Call (DBRPC Token)

**PDU-Typ:** `0x03` (BUF_RPC)  
**Quelldatei:** `DbrpcToken.java`

| Offset | Größe | Feld | Wert |
|--------|-------|------|------|
| 0 | 1 | **Token-Typ** | `0xE6` (230 = DBRPC) |
| 1–2 | 2 | **Länge** | `3 + nameBytes.length` (Big-Endian Short) |
| 3 | 1 | **Name-Länge** | Byte-Länge des Prozedurnamens |
| 4–… | n | **Prozedurname** | z. B. `"sp_myprocedure"` |
| 4+n – 5+n | 2 | **Optionen** | `0x00 0x00` = keine Parameter; `0x00 0x02` = Parameter folgen |

Nach dem DBRPC-Token folgen bei Parametern:
1. PARAMFMT Token (`0xEC`)
2. PARAMS Token (`0xD7`)
3. Rohe Parameterdaten

---

## 6. TDS-Datentypen – Referenz

Alle Typ-Codes aus `TdsConst.java`:

### Ganzzahlen

| Typ | Hex | Dez | Länge |
|-----|-----|-----|-------|
| `INT1` | `0x30` | 48 | 1 Byte fix |
| `INT2` | `0x34` | 52 | 2 Bytes fix |
| `INT4` | `0x38` | 56 | 4 Bytes fix |
| `INT8` | `0xBF` | 191 | 8 Bytes fix |
| `INTN` | `0x26` | 38 | 1 Byte Längenfeld |
| `UINT2` | `0x41` | 65 | 2 Bytes fix |
| `UINT4` | `0x42` | 66 | 4 Bytes fix |
| `UINT8` | `0x43` | 67 | 8 Bytes fix |
| `UINTN` | `0x44` | 68 | 1 Byte Längenfeld |

### Fließkommazahlen

| Typ | Hex | Dez | Länge |
|-----|-----|-----|-------|
| `FLT4` | `0x3B` | 59 | 4 Bytes fix |
| `FLT8` | `0x3E` | 62 | 8 Bytes fix |
| `FLTN` | `0x6D` | 109 | 1 Byte Längenfeld |

### Dezimal / Numerisch

| Typ | Hex | Dez | Länge |
|-----|-----|-----|-------|
| `DECN` | `0x6A` | 106 | 1 B Länge + 1 B Precision + 1 B Scale |
| `NUMN` | `0x6C` | 108 | 1 B Länge + 1 B Precision + 1 B Scale |

### Geldtypen

| Typ | Hex | Dez | Länge |
|-----|-----|-----|-------|
| `MONEY` | `0x3C` | 60 | 8 Bytes fix |
| `SHORTMONEY` | `0x7A` | 122 | 4 Bytes fix |
| `MONEYN` | `0x6E` | 110 | 1 Byte Längenfeld |

### Datum / Uhrzeit

| Typ | Hex | Dez | Länge |
|-----|-----|-----|-------|
| `DATE` | `0x31` | 49 | 4 Bytes fix |
| `TIME` | `0x33` | 51 | 4 Bytes fix |
| `SHORTDATE` | `0x3A` | 58 | 4 Bytes fix |
| `DATETIME` | `0x3D` | 61 | 8 Bytes fix |
| `DATETIMN` | `0x6F` | 111 | 1 Byte Längenfeld |
| `DATEN` | `0x7B` | 123 | 1 Byte Längenfeld |
| `TIMEN` | `0x93` | 147 | 1 Byte Längenfeld |
| `BIGDATETIMEN` | `0xBB` | 187 | 1 B Länge + 1 B Scale |
| `BIGTIMEN` | `0xBC` | 188 | 1 B Länge + 1 B Scale |

### Zeichenketten

| Typ | Hex | Dez | Länge |
|-----|-----|-----|-------|
| `CHAR` | `0x2F` | 47 | 1 Byte Längenfeld |
| `VARCHAR` | `0x27` | 39 | 1 Byte Längenfeld |
| `TEXT` | `0x23` | 35 | 4 Bytes Längenfeld |
| `LONGCHAR` | `0xAF` | 175 | 4 Bytes Längenfeld |
| `UNITEXT` | `0xAE` | 174 | 4 Bytes Längenfeld |

### Binärdaten

| Typ | Hex | Dez | Länge |
|-----|-----|-----|-------|
| `BIT` | `0x32` | 50 | 1 Byte fix |
| `BINARY` | `0x2D` | 45 | 1 Byte Längenfeld |
| `VARBINARY` | `0x25` | 37 | 1 Byte Längenfeld |
| `IMAGE` | `0x22` | 34 | 4 Bytes Längenfeld |
| `LONGBINARY` | `0xE1` | 225 | 4 Bytes Längenfeld |
| `BLOB` | `0x24` | 36 | Sonderformat (Untertyp-Byte) |

---

## 7. Vollständige Paketsequenzen

### 7.1 Einfache Query (kein PreparedStatement)

```
┌─────────────────────────────────────────────────────┐
│  TDS Header      [0x01, 0x01, Len_H, Len_L, 0,0,N,0]│
├─────────────────────────────────────────────────────┤
│  LANGUAGE Token                                     │
│    0x21              Token-Typ                      │
│    LL LL LL LL       Body-Länge (4 Bytes)           │
│    SS                Status-Flags                   │
│    [SQL-Bytes]       Query-Text                     │
└─────────────────────────────────────────────────────┘
```

### 7.2 Prepared Statement – PREPARE

```
┌─────────────────────────────────────────────────────┐
│  TDS Header      [0x01, 0x01, ...]                  │
├─────────────────────────────────────────────────────┤
│  DYNAMIC Token (PREPARE)                            │
│    0xE7              Token-Typ                      │
│    LL LL             Gesamtlänge (2 Bytes)          │
│    0x01              Typ: PREPARE                   │
│    SS                Status-Flags                   │
│    NL                Name-Länge                     │
│    [Name-Bytes]      Statement-Name                 │
│    BL BL             SQL-Länge (2 Bytes)            │
│    [SQL-Bytes]       SQL mit Platzhaltern           │
├─────────────────────────────────────────────────────┤
│  PARAMFMT Token                                     │
│    0xEC              Token-Typ                      │
│    FL FL             Format-Länge (2 Bytes)         │
│    PC PC             Parameteranzahl                │
│    [DataFormat]      Pro Parameter:                 │
│      NL [Name]       Name-Länge + Name              │
│      ST              Status                         │
│      UT UT UT UT     User-Typ (4 Bytes)             │
│      DT              Datentyp                       │
│      [Längenfeld]    0–4 Bytes je Typ               │
│      LL [Locale]     Locale-Länge + Locale          │
└─────────────────────────────────────────────────────┘
```

### 7.3 Prepared Statement – EXECUTE

```
┌─────────────────────────────────────────────────────┐
│  TDS Header      [0x01, 0x01, ...]                  │
├─────────────────────────────────────────────────────┤
│  DYNAMIC Token (EXEC)                               │
│    0xE7              Token-Typ                      │
│    LL LL             Gesamtlänge                    │
│    0x02              Typ: EXEC                      │
│    0x01              Status: hat Parameter          │
│    NL                Name-Länge                     │
│    [Name-Bytes]      Statement-Name (= wie PREPARE) │
│    00 00             SQL-Länge: leer                │
├─────────────────────────────────────────────────────┤
│  PARAMS Token                                       │
│    0xD7              Token-Typ (einziges Byte)      │
├─────────────────────────────────────────────────────┤
│  Rohe Parameterdaten (je Parameter):                │
│    [Wert-Bytes]      Format laut PARAMFMT           │
└─────────────────────────────────────────────────────┘
```

### 7.4 Stored Procedure Call

```
┌─────────────────────────────────────────────────────┐
│  TDS Header      [0x03, 0x01, ...]  (BUF_RPC)      │
├─────────────────────────────────────────────────────┤
│  DBRPC Token                                        │
│    0xE6              Token-Typ                      │
│    LL LL             Länge: 3 + NameLen             │
│    NL                Name-Länge                     │
│    [Proc-Name]       Prozedurname                   │
│    OO OO             Optionen (0=keine, 2=Params)   │
├─────────────────────────────────────────────────────┤
│  PARAMFMT Token      (wenn Optionen = 0x0002)       │
│    [wie 7.2]                                        │
├─────────────────────────────────────────────────────┤
│  PARAMS Token                                       │
│    0xD7                                             │
├─────────────────────────────────────────────────────┤
│  Rohe Parameterdaten                                │
└─────────────────────────────────────────────────────┘
```

---

## 8. DYNAMIC vs. DYNAMIC2 – Vergleich

| Feld | DYNAMIC (`0xE7`) | DYNAMIC2 (`0x62`) |
|------|-----------------|------------------|
| Token-Typ | `0xE7` | `0x62` |
| Gesamtlänge | 2 Bytes (Short, max. 32.767) | 4 Bytes (Unsigned Int) |
| SQL-Länge | 2 Bytes (Short, max. 32.767) | 4 Bytes (Unsigned Int) |
| Max. Statement-Größe | 32.767 Bytes | 2.147.483.647 Bytes |

## PARAMFMT vs. PARAMFMT2 – Vergleich

| Feld | PARAMFMT (`0xEC`) | PARAMFMT2 (`0x20`) |
|------|-----------------|-------------------|
| Token-Typ | `0xEC` | `0x20` |
| Format-Länge | 2 Bytes (Short, max. 65.535) | 4 Bytes (Unsigned Int) |
| Status je Parameter | 1 Byte | 4 Bytes (Int) |
| Fixed-Length-Part | 8 Bytes | 11 Bytes |

---

## 9. Hinweise

- **Endianness:** `writeInt()` und `writeShort()` respektieren das `_byteswap`-Flag der Verbindung. Alle Längenfelder in Token-Headern (DYNAMIC, DBRPC etc.) sind immer **Big-Endian**, da sie über `writeShort()` geschrieben werden.
- **String-Encoding:** Alle SQL-Texte und Namen werden über `stringToByte()` des `TdsOutputStream` codiert. Das Encoding hängt vom Verbindungscharset ab (z. B. UTF-8, ISO-8859-1).
- **Kein PARAMFMT bei Literalen:** Wenn Parameter als SQL-Literale gesendet werden (`sendAsLiteral=true`), werden PARAMFMT und PARAMS komplett weggelassen. Die Werte sind direkt im SQL-Text.
- **EXEC_IMMED:** Bei `EXEC_IMMED` (0x08) wird kein vorheriger PREPARE-Schritt benötigt. DYNAMIC-Token trägt sowohl SQL-Body als auch gleich EXEC-Semantik.
