import { LogoutToken }   from '../../../../src/protocol/tokens/logout-token';
import { OptionCmdToken } from '../../../../src/protocol/tokens/option-cmd-token';
import { TokenType, OptionId } from '../../../../src/constants/tds-const';

// ---------------------------------------------------------------------------
// LogoutToken
// ---------------------------------------------------------------------------

describe('LogoutToken', () => {
  describe('build()', () => {
    it('erstes Byte = 0x71 (LOGOUT)', () => {
      expect(LogoutToken.build()[0]).toBe(TokenType.LOGOUT);
    });

    it('zweites Byte = 0x00 (Optionen immer 0)', () => {
      expect(LogoutToken.build()[1]).toBe(0x00);
    });

    it('Gesamtlänge = 2 Bytes', () => {
      expect(LogoutToken.build()).toHaveLength(2);
    });
  });
});

// ---------------------------------------------------------------------------
// OptionCmdToken
// ---------------------------------------------------------------------------

describe('OptionCmdToken', () => {
  describe('build() – Grundstruktur', () => {
    it('erstes Byte = 0xA6 (OPTIONCMD)', () => {
      expect(OptionCmdToken.build(OptionId.ISOLATION, 1)[0]).toBe(TokenType.OPTIONCMD);
    });

    it('Anzahl Optionen (Byte 3) = 1', () => {
      expect(OptionCmdToken.build(OptionId.ISOLATION, 1)[3]).toBe(1);
    });

    it('Option-ID (Byte 4) korrekt', () => {
      expect(OptionCmdToken.build(OptionId.ISOLATION, 1)[4]).toBe(OptionId.ISOLATION);
    });
  });

  describe('build() – 1-Byte-Optionen', () => {
    it('ISOLATION: Wert-Größe (Byte 5) = 1', () => {
      expect(OptionCmdToken.build(OptionId.ISOLATION, 2)[5]).toBe(1);
    });

    it('ISOLATION: Wert korrekt (Byte 6)', () => {
      expect(OptionCmdToken.build(OptionId.ISOLATION, 3)[6]).toBe(3);
    });

    it('ISOLATION: Längenfeld = 3 + 1 = 4', () => {
      expect(OptionCmdToken.build(OptionId.ISOLATION, 1).readUInt16BE(1)).toBe(4);
    });

    it('ISOLATION: Gesamtlänge = 7', () => {
      expect(OptionCmdToken.build(OptionId.ISOLATION, 1)).toHaveLength(7);
    });

    it('CHAINXACTS: Wert-Größe = 1', () => {
      expect(OptionCmdToken.build(OptionId.CHAINXACTS, 1)[5]).toBe(1);
    });

    it('QUOTED_IDENT: Wert-Größe = 1', () => {
      expect(OptionCmdToken.build(OptionId.QUOTED_IDENT, 1)[5]).toBe(1);
    });
  });

  describe('build() – 4-Byte-Optionen', () => {
    it('TEXTSIZE: Wert-Größe (Byte 5) = 4', () => {
      expect(OptionCmdToken.build(OptionId.TEXTSIZE, 2097152)[5]).toBe(4);
    });

    it('TEXTSIZE: Wert (4 Bytes BE) korrekt', () => {
      const buf = OptionCmdToken.build(OptionId.TEXTSIZE, 2097152);
      expect(buf.readUInt32BE(6)).toBe(2097152);
    });

    it('TEXTSIZE: Längenfeld = 3 + 4 = 7', () => {
      expect(OptionCmdToken.build(OptionId.TEXTSIZE, 2097152).readUInt16BE(1)).toBe(7);
    });

    it('TEXTSIZE: Gesamtlänge = 10', () => {
      expect(OptionCmdToken.build(OptionId.TEXTSIZE, 2097152)).toHaveLength(10);
    });

    it('ROWCOUNT: Wert-Größe = 4', () => {
      expect(OptionCmdToken.build(OptionId.ROWCOUNT, 100)[5]).toBe(4);
    });
  });
});
