import { EnvChangeParser } from '../../../../src/protocol/response/env-change-token';
import { TokenType, EnvType } from '../../../../src/constants/tds-const';
import { TdsWriter } from '../../../../src/protocol/tds-writer';

function makeEnvChange(entries: Array<{ type: number; newValue: string; oldValue: string }>): Buffer {
  // Berechne Body-Länge: Summe aller Einträge
  let bodyLen = 0;
  const entryBuffers: Buffer[] = [];

  for (const e of entries) {
    const newBytes = Buffer.from(e.newValue, 'ascii');
    const oldBytes = Buffer.from(e.oldValue, 'ascii');
    const w = new TdsWriter();
    w.writeUInt8(e.type);
    w.writeUInt8(newBytes.length);
    if (newBytes.length > 0) w.writeBytes(newBytes);
    w.writeUInt8(oldBytes.length);
    if (oldBytes.length > 0) w.writeBytes(oldBytes);
    const buf = w.toBuffer();
    entryBuffers.push(buf);
    bodyLen += buf.length;
  }

  const header = new TdsWriter();
  header.writeUInt8(TokenType.ENVCHANGE);
  header.writeUInt16BE(bodyLen);
  return Buffer.concat([header.toBuffer(), ...entryBuffers]);
}

describe('EnvChangeParser', () => {
  describe('read() – einzelner Eintrag', () => {
    it('entries-Array hat genau einen Eintrag', () => {
      const buf = makeEnvChange([{ type: EnvType.DB, newValue: 'pubs2', oldValue: 'master' }]);
      expect(EnvChangeParser.read(buf).entries).toHaveLength(1);
    });

    it('type korrekt', () => {
      const buf = makeEnvChange([{ type: EnvType.DB, newValue: 'pubs2', oldValue: 'master' }]);
      expect(EnvChangeParser.read(buf).entries[0].type).toBe(EnvType.DB);
    });

    it('newValue korrekt', () => {
      const buf = makeEnvChange([{ type: EnvType.DB, newValue: 'pubs2', oldValue: 'master' }]);
      expect(EnvChangeParser.read(buf).entries[0].newValue).toBe('pubs2');
    });

    it('oldValue korrekt', () => {
      const buf = makeEnvChange([{ type: EnvType.DB, newValue: 'pubs2', oldValue: 'master' }]);
      expect(EnvChangeParser.read(buf).entries[0].oldValue).toBe('master');
    });

    it('leere Werte (packetsize-Änderung nur newValue)', () => {
      const buf = makeEnvChange([{ type: EnvType.PACKETSIZE, newValue: '512', oldValue: '' }]);
      const e = EnvChangeParser.read(buf).entries[0];
      expect(e.newValue).toBe('512');
      expect(e.oldValue).toBe('');
    });
  });

  describe('read() – mehrere Einträge', () => {
    const entries = [
      { type: EnvType.DB,        newValue: 'pubs2',     oldValue: 'master' },
      { type: EnvType.CHARSET,   newValue: 'utf8',      oldValue: 'iso_1'  },
      { type: EnvType.LANG,      newValue: 'us_english', oldValue: ''       },
    ];

    it('alle drei Einträge geparst', () => {
      expect(EnvChangeParser.read(makeEnvChange(entries)).entries).toHaveLength(3);
    });

    it('zweiter Eintrag: type CHARSET', () => {
      expect(EnvChangeParser.read(makeEnvChange(entries)).entries[1].type).toBe(EnvType.CHARSET);
    });

    it('zweiter Eintrag: newValue utf8', () => {
      expect(EnvChangeParser.read(makeEnvChange(entries)).entries[1].newValue).toBe('utf8');
    });

    it('dritter Eintrag: oldValue leer', () => {
      expect(EnvChangeParser.read(makeEnvChange(entries)).entries[2].oldValue).toBe('');
    });
  });

  describe('read() – leere Eintragsliste', () => {
    it('leerer Body → leeres entries-Array', () => {
      const w = new TdsWriter();
      w.writeUInt8(TokenType.ENVCHANGE);
      w.writeUInt16BE(0);
      expect(EnvChangeParser.read(w.toBuffer()).entries).toHaveLength(0);
    });
  });
});
