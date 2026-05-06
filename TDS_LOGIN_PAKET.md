# TDS 5.0 Login-Paket – Byte-Map (jConn4)

Quellen: `com/sybase/jdbc4/tds/LoginToken.java`, `com/sybase/jdbc4/tds/PduOutputFormatter.java`, `com/sybase/jdbc4/tds/TdsConst.java`

---

## Teil 1: TDS Netzwerk-Header (8 Bytes)

Geschrieben von `PduOutputFormatter.doFlush()`. Diese 8 Bytes stehen **vor** jedem TDS-Paket.

| Byte | Größe | Feld | Wert |
|------|-------|------|------|
| 0 | 1 | **PDU-Typ** | `0x02` = `BUF_LOGIN` |
| 1 | 1 | **Status-Flags** | `0x01` = letztes Paket (EOM); `0x00` = weitere Pakete folgen |
| 2–3 | 2 | **Paketlänge** | Gesamtlänge inkl. 8-Byte-Header, Big-Endian |
| 4–5 | 2 | **Channel** | `0x00 0x00` (immer 0) |
| 6 | 1 | **Paketnummer** | Sequenznummer, beginnend bei 1 |
| 7 | 1 | **Window** | `0x00` (immer 0) |

---

## Teil 2: Login-Body (568 Bytes)

Geschrieben von `LoginToken.send()`. Offsets sind **relativ zum Body-Start** (= Netzwerk-Byte 8+).

### Aufbau von `writeStringLen(str, maxLen)`

Diese Hilfsmethode schreibt **immer genau `maxLen + 1` Bytes**:

```
[String-Bytes (actual)][Null-Padding bis maxLen][1 Byte: tatsächliche Länge]
```

### Vollständige Byte-Tabelle

| Offset | Größe | Feld | Inhalt / Werte |
|--------|-------|------|----------------|
| **0–29** | 30 | **Hostname** (Inhalt, null-padded) | Client-Hostname; max. 30 Zeichen |
| **30** | 1 | Hostname-Länge | Anzahl gültiger Bytes in Byte 0–29 |
| **31–60** | 30 | **Username** (Inhalt, null-padded) | Datenbankbenutzer; max. 30 Zeichen |
| **61** | 1 | Username-Länge | |
| **62–91** | 30 | **Passwort / Credential** (null-padded) | Klartext; leer wenn `encryptedPassword=true` oder Kerberos |
| **92** | 1 | Passwort-Länge | |
| **93–122** | 30 | **Host-Prozess-ID** (null-padded) | PID des Client-Prozesses als ASCII-String |
| **123** | 1 | Hostproc-Länge | |
| **124** | 1 | **INT2-Byte-Order** (`lint2`) | `0x02` = Big-Endian *(Standard)*; `0x03` = Little-Endian |
| **125** | 1 | **INT4-Byte-Order** (`lint4`) | `0x00` = Big-Endian *(Standard)*; `0x01` = Little-Endian |
| **126** | 1 | **Zeichentyp** (`ltype`) | `0x06` *(hardcoded)* |
| **127** | 1 | **Float-Typ** (`lflt`) | `0x04` = IEEE 754 Double, Big-Endian *(Standard)*; `0x0A` = Little-Endian |
| **128** | 1 | **Datetime-Typ** (`ldate`) | `0x08` = zwei INT4 Big-Endian *(Standard)*; `0x09` = Little-Endian |
| **129** | 1 | **Interface-Typ** | `0x01` = SQL *(hardcoded)* |
| **130** | 1 | **Verbindungstyp** | `0x00` *(hardcoded)* |
| **131** | 1 | Spare | `0x00` |
| **132** | 1 | Spare | `0x00` |
| **133–136** | 4 | **Netzwerk-Puffergröße** (`bufSize`) | Default: `512` (`0x00000200`); Endianness abhängig von `byteswap` |
| **137–139** | 3 | Spare (`SPARE`) | `0x00 0x00 0x00` |
| **140–169** | 30 | **Applikationsname** (null-padded) | Aufrufende Klasse oder gesetzter App-Name; max. 30 Zeichen |
| **170** | 1 | AppName-Länge | |
| **171–200** | 30 | **Servername / Service** (null-padded) | Ziel-Datenbankserver; max. 30 Zeichen |
| **201** | 1 | Servername-Länge | |
| **202–456** | 255 | **Remote-Passwort** (null-padded) | Encoded; leer wenn `encryptedPassword=true`; Format: `\0<len><pw>` |
| **457** | 1 | RemotePw-Länge | |
| **458–461** | 4 | **TDS-Version** (`TDSVERSION`) | `0x05 0x00 0x00 0x00` = TDS 5.0 |
| **462–471** | 10 | **Programmname** (null-padded) | `"jConnect"` |
| **472** | 1 | Programmname-Länge | `0x08` |
| **473–476** | 4 | **Programmversion** (`progVers`) | `[Major, Minor, Point, SP/10]` — aus `SybVersion` |
| **477** | 1 | Spare | `0x00` |
| **478** | 1 | **Float4-Typ** (`lflt4`) | `0x0C` = IEEE 754 Float, Big-Endian *(Standard)*; `0x0D` = Little-Endian |
| **479** | 1 | **Smalldatetime-Typ** (`ldate4`) | `0x10` = zwei INT2 Big-Endian *(Standard)*; `0x11` = Little-Endian |
| **480–509** | 30 | **Sprache** (null-padded) | z. B. `"us_english"`; max. 30 Zeichen |
| **510** | 1 | Sprache-Länge | |
| **511** | 1 | **Notify-Language-Changes** | `0x00` *(hardcoded)* |
| **512–513** | 2 | `OLDSECURE` | `0x00 0x00` |
| **514** | 1 | **Security-Login-Flags** (`lseclogin`) | Bit-Flags — siehe Tabelle unten |
| **515** | 1 | Security-Bulk | `0x00` *(hardcoded)* |
| **516** | 1 | **HA-Login-Typ** (`lhalogin`) | Bit-Flags: Session(1), Resume(2), Failover(4), Redirect(8), Migrate(16) |
| **517–522** | 6 | **HA-Session-ID** (`lhasessionid`) | Session-Identifikator für High-Availability-Verbindungen |
| **523–524** | 2 | `SECSPARE` | `0x00 0x00` |
| **525–554** | 30 | **Zeichensatz** (null-padded) | z. B. `"utf8"`, `"iso_1"`; max. 30 Zeichen |
| **555** | 1 | Charset-Länge | |
| **556** | 1 | **Notify-Charset-Changes** | `0x01` *(hardcoded)* |
| **557–562** | 6 | **Paketgröße als String** (null-padded) | ASCII-Zahl, z. B. `"512"`; max. 6 Zeichen |
| **563** | 1 | Paketgröße-Länge | |
| **564–567** | 4 | `DUMMY` | `0x00 0x00 0x00 0x00` |

**Gesamtgröße Login-Body: 568 Bytes**

---

## `lseclogin` – Bit-Flags (Body-Byte 514)

Definiert in `TdsConst.java`:

| Wert (dez) | Hex | Konstante | Bedeutung |
|------------|-----|-----------|-----------|
| `0` | `0x00` | — | Kein Security-Modus (Standard) |
| `1` | `0x01` | `SEC_LOG_ENCRYPT` | Passwort-Verschlüsselung (Ebene 1) |
| `2` | `0x02` | `SEC_LOG_CHALLENGE` | Challenge-Response |
| `4` | `0x04` | `SEC_LOG_LABELS` | Security-Labels |
| `8` | `0x08` | `SEC_LOG_APPDEFINED` | App-definierte Security |
| `16` | `0x10` | `SEC_LOG_SECSESSION` | Kerberos-Authentifizierung |
| `32` | `0x20` | `SEC_LOG_ENCRYPT2` | Passwort-Verschlüsselung (Ebene 2) |
| `128` | `0x80` | `SEC_LOG_ENCRYPT3` | Passwort-Verschlüsselung (Ebene 3) |
| `161` | `0xA1` | `ENCRYPT + ENCRYPT2 + ENCRYPT3` | Gesetzt bei `encryptedPassword=true` |

---

## HA-Login-Flags (Body-Byte 516)

| Bit-Wert | Konstante | Bedeutung |
|----------|-----------|-----------|
| `1` | `HA_LOG_SESSION` | Neue HA-Session |
| `2` | `HA_LOG_RESUME` | Session-Wiederaufnahme |
| `4` | `HA_LOG_FAILOVERSRV` | Failover-Server |
| `8` | `HA_LOG_REDIRECT` | Verbindungs-Redirect |
| `16` | `HA_LOG_MIGRATE` | Migration |

---

## Byte-Order-Typen – Referenz

Alle Format-Codes stammen aus `TdsConst.java` und werden während des Logins ausgehandelt:

| Konstante | Wert | Verwendung |
|-----------|------|------------|
| `INT4_LSB_HI` | `0` | INT4 Big-Endian (MSB first) |
| `INT4_LSB_LO` | `1` | INT4 Little-Endian (LSB first) |
| `INT2_LSB_HI` | `2` | INT2 Big-Endian |
| `INT2_LSB_LO` | `3` | INT2 Little-Endian |
| `FLT_IEEE_HI` | `4` | IEEE 754 Double, Big-Endian |
| `FLT_IEEE_LO` | `10` | IEEE 754 Double, Little-Endian |
| `FLT4_IEEE_HI` | `12` | IEEE 754 Float, Big-Endian |
| `FLT4_IEEE_LO` | `13` | IEEE 754 Float, Little-Endian |
| `TWO_I4_LSB_HI` | `8` | Datetime: zwei INT4 Big-Endian |
| `TWO_I4_LSB_LO` | `9` | Datetime: zwei INT4 Little-Endian |
| `TWO_I2_LSB_HI` | `16` | Smalldatetime: zwei INT2 Big-Endian |
| `TWO_I2_LSB_LO` | `17` | Smalldatetime: zwei INT2 Little-Endian |

---

## Gesamtstruktur des Netzwerk-Pakets

```
┌─────────────────────────────────────────────────┐
│  TDS Netzwerk-Header         (8 Bytes)          │
│    Byte 0:   PDU-Typ = 0x02 (BUF_LOGIN)         │
│    Byte 1:   Status-Flags                       │
│    Byte 2-3: Paketlänge (Big-Endian)            │
│    Byte 4-5: Channel (0x0000)                   │
│    Byte 6:   Paketnummer                        │
│    Byte 7:   Window (0x00)                      │
├─────────────────────────────────────────────────┤
│  Login-Body                  (568 Bytes)        │
│    Byte   0-30:   Hostname       (30+1)         │
│    Byte  31-61:   Username       (30+1)         │
│    Byte  62-92:   Passwort       (30+1)         │
│    Byte  93-123:  Host-PID       (30+1)         │
│    Byte 124-132:  Format-Flags   (9×1)          │
│    Byte 133-136:  Puffergröße    (4)            │
│    Byte 137-139:  Spare          (3)            │
│    Byte 140-170:  App-Name       (30+1)         │
│    Byte 171-201:  Server-Name    (30+1)         │
│    Byte 202-457:  Remote-Pw      (255+1)        │
│    Byte 458-461:  TDS-Version    (4)            │
│    Byte 462-472:  Prog-Name      (10+1)         │
│    Byte 473-476:  Prog-Version   (4)            │
│    Byte 477-479:  Spare+Floats   (3)            │
│    Byte 480-510:  Sprache        (30+1)         │
│    Byte 511-524:  Security       (14)           │
│    Byte 525-555:  Charset        (30+1)         │
│    Byte 556:      Notify-Charset (1)            │
│    Byte 557-563:  Paketgröße     (6+1)          │
│    Byte 564-567:  Dummy          (4)            │
├─────────────────────────────────────────────────┤
│  Capability-Token            (variabel)         │
│    Folgt direkt nach dem Login-Body;            │
│    enthält REQ- und RES-Capabilities            │
│    (siehe CapabilityToken.java + TdsConst.java) │
└─────────────────────────────────────────────────┘
```

---

## Hinweise

- **Byte-Order**: `writeInt()` respektiert das `_byteswap`-Flag. Bei aktiviertem Byteswap werden INT4-Werte Little-Endian geschrieben. Alle anderen Multi-Byte-Felder (Format-Flags) werden als einzelne Bytes übertragen.
- **Passwort-Verschlüsselung** (`encryptedPassword=true`): Das Passwort-Feld (Byte 62–92) bleibt leer, `lseclogin` wird auf `0xA1` gesetzt. Das eigentliche Passwort wird später über `MSG_SEC_*`-Nachrichten ausgetauscht.
- **Kerberos**: Das Passwort-Feld bleibt ebenfalls leer, `lseclogin = 0x10` (`SEC_LOG_SECSESSION`). Nach dem Login folgen Kerberos-Handshake-Pakete (`KerberosSessionContext`).
- **Remote-Passwort** (Byte 202–457): Format bei einfachem Login: `\0<1 Byte Länge><Passwort-Bytes>`. Bei verketteten Servern können mehrere Einträge folgen.
