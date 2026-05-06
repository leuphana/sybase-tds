import { ParamFmtToken } from '../../../../src/protocol/tokens/param-fmt-token';
import { ParamsToken }   from '../../../../src/protocol/tokens/params-token';
import { DataFormat }    from '../../../../src/types/data-format';
import { TokenType, DataType, ParamStatus } from '../../../../src/constants/tds-const';

describe('ParamFmtToken', () => {
  describe('build() – Grundstruktur', () => {
    it('erstes Byte = 0xEC (PARAMFMT)', () => {
      const buf = ParamFmtToken.build([]);
      expect(buf[0]).toBe(TokenType.PARAMFMT);
    });

    it('Bytes 1-2 = Format-Länge (2 = Parameteranzahl-Feld)', () => {
      const buf = ParamFmtToken.build([]);
      // Keine Parameter → fmtLen = 2 (nur paramCount-Feld)
      expect(buf.readUInt16BE(1)).toBe(2);
    });

    it('Bytes 3-4 = Parameteranzahl = 0 bei leerer Liste', () => {
      const buf = ParamFmtToken.build([]);
      expect(buf.readUInt16BE(3)).toBe(0);
    });

    it('Gesamtlänge = 1 (typ) + 2 (fmtLen) + 2 (paramCount) = 5 bei 0 Parametern', () => {
      expect(ParamFmtToken.build([])).toHaveLength(5);
    });
  });

  describe('build() – mit Parametern', () => {
    it('Parameteranzahl korrekt für 2 Parameter', () => {
      const params = [
        new DataFormat(DataType.INT4),
        new DataFormat(DataType.VARCHAR, { maxLength: 50 }),
      ];
      const buf = ParamFmtToken.build(params);
      expect(buf.readUInt16BE(3)).toBe(2);
    });

    it('Format-Länge = 2 (paramCount) + Summe aller DataFormat-Bytes', () => {
      const p1 = new DataFormat(DataType.INT4);
      const p2 = new DataFormat(DataType.INT4);
      const fmtDataLen = p1.build().length + p2.build().length;
      const buf = ParamFmtToken.build([p1, p2]);
      expect(buf.readUInt16BE(1)).toBe(2 + fmtDataLen);
    });

    it('DataFormat-Blöcke folgen direkt nach paramCount', () => {
      const param = new DataFormat(DataType.INT4);
      const buf = ParamFmtToken.build([param]);
      // DataFormat-Block beginnt bei Offset 5
      const fmtBlock = buf.slice(5);
      expect(fmtBlock).toEqual(param.build());
    });

    it('DataType-Bytes der Parameter sind in korrekter Reihenfolge', () => {
      const params = [
        new DataFormat(DataType.INT4),
        new DataFormat(DataType.VARCHAR, { maxLength: 20 }),
      ];
      const buf = ParamFmtToken.build(params);
      const p1Buf = params[0].build();
      const p2Buf = params[1].build();
      const fmtStart = 5;
      expect(buf.slice(fmtStart, fmtStart + p1Buf.length)).toEqual(p1Buf);
      expect(buf.slice(fmtStart + p1Buf.length, fmtStart + p1Buf.length + p2Buf.length))
        .toEqual(p2Buf);
    });

    it('NULLALLOWED-Status wird korrekt übertragen', () => {
      const param = new DataFormat(DataType.VARCHAR, {
        maxLength: 50,
        status: ParamStatus.NULLALLOWED,
      });
      const buf = ParamFmtToken.build([param]);
      // DataFormat-Block: nameLen(1=0) + status(1) ...
      const fmtBlock = buf.slice(5);
      expect(fmtBlock[1]).toBe(ParamStatus.NULLALLOWED);
    });
  });
});

describe('ParamsToken', () => {
  describe('buildMarker()', () => {
    it('gibt genau 1 Byte zurück (0xD7)', () => {
      const buf = ParamsToken.buildMarker();
      expect(buf).toHaveLength(1);
      expect(buf[0]).toBe(TokenType.PARAMS);
    });
  });

  describe('build()', () => {
    it('erstes Byte = 0xD7 (PARAMS-Marker)', () => {
      const buf = ParamsToken.build(Buffer.from([0x01, 0x02]));
      expect(buf[0]).toBe(TokenType.PARAMS);
    });

    it('rohe Parameterdaten folgen direkt nach dem Marker', () => {
      const paramData = Buffer.from([0x04, 0x00, 0x00, 0x00, 0x2A]); // INT4 = 42
      const buf = ParamsToken.build(paramData);
      expect(buf.slice(1)).toEqual(paramData);
    });

    it('leere Parameterdaten → nur Marker-Byte', () => {
      expect(ParamsToken.build(Buffer.alloc(0))).toHaveLength(1);
    });
  });
});
