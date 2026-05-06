import { TokenParser, TdsToken } from '../../../../src/protocol/response/token-parser';
import { TokenType, DataType, DoneStatus, EnvType, LoginAckStatus } from '../../../../src/constants/tds-const';
import { DataFormat } from '../../../../src/types/data-format';
import { TdsWriter } from '../../../../src/protocol/tds-writer';

// ---------------------------------------------------------------------------
// Hilfsfunktionen zum Bauen von Token-Buffern
// ---------------------------------------------------------------------------

function loginAckBuf(status = LoginAckStatus.SUCCEED): Buffer {
  const name = Buffer.from('ASE');
  const bodyLen = 1 + 4 + 1 + name.length + 4;
  const w = new TdsWriter();
  w.writeUInt8(TokenType.LOGINACK);
  w.writeUInt16BE(bodyLen);
  w.writeUInt8(status);
  w.writeBytes(Buffer.from([0x05, 0x00, 0x00, 0x00]));
  w.writeUInt8(name.length);
  w.writeBytes(name);
  w.writeBytes(Buffer.from([0x0F, 0x00, 0x00, 0x00]));
  return w.toBuffer();
}

function doneBuf(status = 0, rowCount = 0): Buffer {
  const w = new TdsWriter();
  w.writeUInt8(TokenType.DONE);
  w.writeUInt16BE(status);
  w.writeUInt16BE(0);
  w.writeUInt32BE(rowCount);
  return w.toBuffer();
}

function eedBuf(): Buffer {
  const msg = Buffer.from('Object not found', 'utf8');
  const srv = Buffer.from('srv', 'ascii');
  const bodyLen = 4 + 1 + 1 + 1 + 0 + 1 + 2 + 2 + msg.length + 1 + srv.length + 1 + 0 + 2;
  const w = new TdsWriter();
  w.writeUInt8(TokenType.EED);
  w.writeUInt16BE(bodyLen);
  w.writeUInt32BE(208);
  w.writeUInt8(1);   // state
  w.writeUInt8(16);  // severity
  w.writeUInt8(0);   // sqlStateLen = 0
  w.writeUInt8(0x00); // status
  w.writeUInt16BE(0); // tranState
  w.writeUInt16BE(msg.length);
  w.writeBytes(msg);
  w.writeUInt8(srv.length);
  w.writeBytes(srv);
  w.writeUInt8(0);   // procNameLen = 0
  w.writeUInt16BE(1); // lineNumber
  return w.toBuffer();
}

function envChangeBuf(): Buffer {
  const newVal = Buffer.from('pubs2', 'ascii');
  const oldVal = Buffer.from('master', 'ascii');
  const bodyLen = 1 + 1 + newVal.length + 1 + oldVal.length;
  const w = new TdsWriter();
  w.writeUInt8(TokenType.ENVCHANGE);
  w.writeUInt16BE(bodyLen);
  w.writeUInt8(EnvType.DB);
  w.writeUInt8(newVal.length);
  w.writeBytes(newVal);
  w.writeUInt8(oldVal.length);
  w.writeBytes(oldVal);
  return w.toBuffer();
}

function rowFmtBuf(columns: DataFormat[]): Buffer {
  const blocks = columns.map(c => c.build());
  const bodyLen = 2 + blocks.reduce((s, b) => s + b.length, 0);
  const w = new TdsWriter();
  w.writeUInt8(TokenType.ROWFMT);
  w.writeUInt16BE(bodyLen);
  w.writeUInt16BE(columns.length);
  for (const b of blocks) w.writeBytes(b);
  return w.toBuffer();
}

function rowBuf(intVal: number, strVal: string): Buffer {
  const str = Buffer.from(strVal, 'utf8');
  const w = new TdsWriter();
  w.writeUInt8(TokenType.ROW);
  w.writeUInt32BE(intVal); // fixed INT4
  w.writeUInt8(str.length);
  w.writeBytes(str);
  return w.toBuffer();
}

// ---------------------------------------------------------------------------

describe('TokenParser', () => {
  describe('parse() – Login-Sequenz (LOGINACK + DONE)', () => {
    const data = Buffer.concat([loginAckBuf(), doneBuf()]);

    it('gibt genau 2 Tokens zurück', () => {
      expect(new TokenParser().parse(data)).toHaveLength(2);
    });

    it('erster Token: loginAck', () => {
      expect(new TokenParser().parse(data)[0].type).toBe('loginAck');
    });

    it('zweiter Token: done', () => {
      expect(new TokenParser().parse(data)[1].type).toBe('done');
    });

    it('loginAck succeeded() korrekt', () => {
      const t = new TokenParser().parse(data)[0];
      expect(t.type === 'loginAck' && t.data.succeeded()).toBe(true);
    });
  });

  describe('parse() – Query-Sequenz (ROWFMT + ROW + ROW + DONE)', () => {
    const cols = [
      new DataFormat(DataType.INT4),
      new DataFormat(DataType.VARCHAR, { maxLength: 50 }),
    ];
    const data = Buffer.concat([
      rowFmtBuf(cols),
      rowBuf(1, 'alice'),
      rowBuf(2, 'bob'),
      doneBuf(DoneStatus.COUNT, 2),
    ]);

    let tokens: TdsToken[];
    beforeEach(() => { tokens = new TokenParser().parse(data); });

    it('gibt 4 Tokens zurück (rowFmt + row + row + done)', () => {
      expect(tokens).toHaveLength(4);
    });

    it('erster Token: rowFmt', () => {
      expect(tokens[0].type).toBe('rowFmt');
    });

    it('zweiter Token: row', () => {
      expect(tokens[1].type).toBe('row');
    });

    it('dritter Token: row', () => {
      expect(tokens[2].type).toBe('row');
    });

    it('vierter Token: done', () => {
      expect(tokens[3].type).toBe('done');
    });

    it('rowFmt enthält 2 Spalten', () => {
      expect(tokens[0].type === 'rowFmt' && tokens[0].data.columns).toHaveLength(2);
    });

    it('erste ROW-Zeile: INT4-Wert = 1', () => {
      const t = tokens[1];
      expect(t.type === 'row' && t.data.values[0]?.readUInt32BE(0)).toBe(1);
    });

    it('zweite ROW-Zeile: VARCHAR = "bob"', () => {
      const t = tokens[2];
      expect(t.type === 'row' && t.data.values[1]?.toString('utf8')).toBe('bob');
    });

    it('done rowCount = 2', () => {
      const t = tokens[3];
      expect(t.type === 'done' && t.data.rowCount).toBe(2);
    });
  });

  describe('parse() – EED + DONE', () => {
    const data = Buffer.concat([eedBuf(), doneBuf(DoneStatus.ERROR)]);

    it('gibt 2 Tokens zurück', () => {
      expect(new TokenParser().parse(data)).toHaveLength(2);
    });

    it('erster Token: eed', () => {
      expect(new TokenParser().parse(data)[0].type).toBe('eed');
    });

    it('EED errorNumber = 208', () => {
      const t = new TokenParser().parse(data)[0];
      expect(t.type === 'eed' && t.data.errorNumber).toBe(208);
    });
  });

  describe('parse() – ENVCHANGE + DONE', () => {
    const data = Buffer.concat([envChangeBuf(), doneBuf()]);

    it('erster Token: envChange', () => {
      expect(new TokenParser().parse(data)[0].type).toBe('envChange');
    });

    it('ENVCHANGE entry.newValue = pubs2', () => {
      const t = new TokenParser().parse(data)[0];
      expect(t.type === 'envChange' && t.data.entries[0].newValue).toBe('pubs2');
    });
  });

  describe('parse() – leerer Buffer', () => {
    it('gibt leeres Array zurück', () => {
      expect(new TokenParser().parse(Buffer.alloc(0))).toHaveLength(0);
    });
  });

  describe('parse() – unbekannter Token', () => {
    it('wirft bei unbekanntem Token-Typ', () => {
      // Verwende einen Token-Typ, der nicht in der Dispatch-Tabelle ist
      const w = new TdsWriter();
      w.writeUInt8(0x99); // unbekannt
      expect(() => new TokenParser().parse(w.toBuffer())).toThrow();
    });
  });
});
