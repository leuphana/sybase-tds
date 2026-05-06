import { LoginToken } from '../../../../src/protocol/tokens/login-token';
import { SecLoginFlags, ByteOrder } from '../../../../src/constants/tds-const';

// Login-Body ist genau 568 Bytes (ohne TDS-Netzwerk-Header)
const LOGIN_BODY_SIZE = 568;

// Byte-Offsets im Login-Body (relativ zum Body-Start, aus TDS_LOGIN_PAKET.md)
const OFF = {
  HOSTNAME_END:   30,   // Längen-Byte für Hostname
  USERNAME_START: 31,
  USERNAME_END:   61,
  PASSWORD_END:   92,
  HOSTPROC_END:   123,
  INT2_ORDER:     124,
  INT4_ORDER:     125,
  CHAR_TYPE:      126,
  FLOAT_TYPE:     127,
  DATETIME_TYPE:  128,
  INTERFACE:      129,
  CONN_TYPE:      130,
  BUFSIZE:        133,  // 4 Bytes
  APPNAME_END:    170,
  SERVERNAME_END: 201,
  REMOTEPW_END:   457,
  TDS_VERSION:    458,  // 4 Bytes
  PROGNAME_END:   472,
  PROGVERSION:    473,  // 4 Bytes
  FLOAT4_TYPE:    478,
  SMALLDATE_TYPE: 479,
  LANGUAGE_END:   510,
  LSECLOGIN:      514,
  CHARSET_END:    555,
  NOTIFY_CHARSET: 556,
  PKTSIZE_END:    563,
  DUMMY:          564,  // 4 Bytes
};

describe('LoginToken', () => {
  describe('build() – Grundstruktur', () => {
    it('gibt genau 568 Bytes zurück', () => {
      const buf = LoginToken.build({ username: 'sa', password: '' });
      expect(buf).toHaveLength(LOGIN_BODY_SIZE);
    });

    it('TDS-Version: Bytes 458-461 = [0x05, 0x00, 0x00, 0x00]', () => {
      const buf = LoginToken.build({ username: 'sa', password: '' });
      expect(buf[OFF.TDS_VERSION]).toBe(0x05);
      expect(buf[OFF.TDS_VERSION + 1]).toBe(0x00);
      expect(buf[OFF.TDS_VERSION + 2]).toBe(0x00);
      expect(buf[OFF.TDS_VERSION + 3]).toBe(0x00);
    });

    it('Interface-Typ (Byte 129) = 0x01 (SQL)', () => {
      const buf = LoginToken.build({ username: 'sa', password: '' });
      expect(buf[OFF.INTERFACE]).toBe(0x01);
    });

    it('Verbindungstyp (Byte 130) = 0x00', () => {
      const buf = LoginToken.build({ username: 'sa', password: '' });
      expect(buf[OFF.CONN_TYPE]).toBe(0x00);
    });

    it('Char-Type (Byte 126) = 0x06', () => {
      const buf = LoginToken.build({ username: 'sa', password: '' });
      expect(buf[OFF.CHAR_TYPE]).toBe(0x06);
    });

    it('Notify-Charset (Byte 556) = 0x01', () => {
      const buf = LoginToken.build({ username: 'sa', password: '' });
      expect(buf[OFF.NOTIFY_CHARSET]).toBe(0x01);
    });

    it('DUMMY-Bytes 564-567 = 0x00', () => {
      const buf = LoginToken.build({ username: 'sa', password: '' });
      expect(buf[OFF.DUMMY]).toBe(0x00);
      expect(buf[OFF.DUMMY + 3]).toBe(0x00);
    });
  });

  describe('build() – Byte-Order (Standard: Big-Endian)', () => {
    it('INT2-Byte-Order (Byte 124) = 0x02 (BE)', () => {
      const buf = LoginToken.build({ username: 'sa', password: '' });
      expect(buf[OFF.INT2_ORDER]).toBe(ByteOrder.INT2_BE);
    });

    it('INT4-Byte-Order (Byte 125) = 0x00 (BE)', () => {
      const buf = LoginToken.build({ username: 'sa', password: '' });
      expect(buf[OFF.INT4_ORDER]).toBe(ByteOrder.INT4_BE);
    });

    it('Float-Typ (Byte 127) = 0x04 (IEEE 754 BE)', () => {
      const buf = LoginToken.build({ username: 'sa', password: '' });
      expect(buf[OFF.FLOAT_TYPE]).toBe(ByteOrder.FLT_BE);
    });

    it('Float4-Typ (Byte 478) = 0x0C (IEEE 754 Float BE)', () => {
      const buf = LoginToken.build({ username: 'sa', password: '' });
      expect(buf[OFF.FLOAT4_TYPE]).toBe(ByteOrder.FLT4_BE);
    });

    it('Datetime-Typ (Byte 128) = 0x08 (TWO_I4 BE)', () => {
      const buf = LoginToken.build({ username: 'sa', password: '' });
      expect(buf[OFF.DATETIME_TYPE]).toBe(ByteOrder.TWO_I4_BE);
    });

    it('Smalldatetime-Typ (Byte 479) = 0x10 (TWO_I2 BE)', () => {
      const buf = LoginToken.build({ username: 'sa', password: '' });
      expect(buf[OFF.SMALLDATE_TYPE]).toBe(ByteOrder.TWO_I2_BE);
    });
  });

  describe('build() – Byte-Order (byteswap=true: Little-Endian)', () => {
    it('INT2-Byte-Order = 0x03 (LE)', () => {
      const buf = LoginToken.build({ username: 'sa', password: '', byteswap: true });
      expect(buf[OFF.INT2_ORDER]).toBe(ByteOrder.INT2_LE);
    });

    it('INT4-Byte-Order = 0x01 (LE)', () => {
      const buf = LoginToken.build({ username: 'sa', password: '', byteswap: true });
      expect(buf[OFF.INT4_ORDER]).toBe(ByteOrder.INT4_LE);
    });

    it('bufSize 512 in LE geschrieben', () => {
      const buf = LoginToken.build({ username: 'sa', password: '', byteswap: true, packetSize: 512 });
      expect(buf.readUInt32LE(OFF.BUFSIZE)).toBe(512);
    });
  });

  describe('build() – String-Felder', () => {
    it('Username korrekt eingebettet', () => {
      const buf = LoginToken.build({ username: 'myuser', password: '' });
      // Username: Bytes 31-60 = Content, Byte 61 = Länge
      expect(buf.slice(OFF.USERNAME_START, OFF.USERNAME_START + 6).toString('latin1')).toBe('myuser');
      expect(buf[OFF.USERNAME_END]).toBe(6);
    });

    it('Hostname korrekt eingebettet (max 30 Bytes)', () => {
      const buf = LoginToken.build({ username: 'sa', password: '', hostname: 'myhost' });
      expect(buf.slice(0, 6).toString('latin1')).toBe('myhost');
      expect(buf[OFF.HOSTNAME_END]).toBe(6);
    });

    it('Hostname-Padding mit 0x00 aufgefüllt', () => {
      const buf = LoginToken.build({ username: 'sa', password: '', hostname: 'AB' });
      expect(buf[2]).toBe(0x00); // Padding nach 'A','B'
    });

    it('Passwort korrekt eingebettet (Plaintext)', () => {
      const buf = LoginToken.build({ username: 'sa', password: 'secret' });
      expect(buf.slice(62, 68).toString('latin1')).toBe('secret');
      expect(buf[OFF.PASSWORD_END]).toBe(6);
    });

    it('Charset korrekt eingebettet (Bytes 525-555)', () => {
      const buf = LoginToken.build({ username: 'sa', password: '', charset: 'utf8' });
      expect(buf.slice(525, 529).toString('latin1')).toBe('utf8');
      expect(buf[OFF.CHARSET_END]).toBe(4);
    });

    it('Paketgröße als String in Bytes 557-562', () => {
      const buf = LoginToken.build({ username: 'sa', password: '', packetSize: 4096 });
      const pktStr = buf.slice(557, 561).toString('latin1');
      expect(pktStr).toBe('4096');
      expect(buf[OFF.PKTSIZE_END]).toBe(4);
    });

    it('bufSize-Feld (Bytes 133-136) enthält die Paketgröße BE', () => {
      const buf = LoginToken.build({ username: 'sa', password: '', packetSize: 512 });
      expect(buf.readUInt32BE(OFF.BUFSIZE)).toBe(512);
    });
  });

  describe('build() – Passwort-Verschlüsselung', () => {
    it('Password-Feld leer wenn encryptedPassword=true', () => {
      const buf = LoginToken.build({ username: 'sa', password: 'secret', encryptedPassword: true });
      // Bytes 62-91: Content, Byte 92: Länge
      for (let i = 62; i <= 92; i++) {
        expect(buf[i]).toBe(0x00);
      }
    });

    it('lseclogin = 0xA1 wenn encryptedPassword=true', () => {
      const buf = LoginToken.build({ username: 'sa', password: '', encryptedPassword: true });
      expect(buf[OFF.LSECLOGIN]).toBe(SecLoginFlags.ALL_ENCRYPT);
    });

    it('lseclogin = 0x00 bei normalem Login', () => {
      const buf = LoginToken.build({ username: 'sa', password: '' });
      expect(buf[OFF.LSECLOGIN]).toBe(SecLoginFlags.NONE);
    });
  });

  describe('build() – Remote-Passwort', () => {
    it('Remote-Passwort leer (Länge 0x00) wenn encryptedPassword=true', () => {
      const buf = LoginToken.build({ username: 'sa', password: 'x', encryptedPassword: true });
      expect(buf[OFF.REMOTEPW_END]).toBe(0x00);
    });

    it('Remote-Passwort enthält \\0 + Länge + Passwort bei normalem Login', () => {
      const buf = LoginToken.build({ username: 'sa', password: 'hi' });
      expect(buf[202]).toBe(0x00);       // leading null
      expect(buf[203]).toBe(2);          // password length
      expect(buf[204]).toBe(0x68);       // 'h'
      expect(buf[205]).toBe(0x69);       // 'i'
      expect(buf[OFF.REMOTEPW_END]).toBe(4); // total: 1 null + 1 len + 2 chars
    });
  });
});
