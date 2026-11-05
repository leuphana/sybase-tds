/**
 * Regressionstests für Code-Review 2026-11-05: K4, H6, H9, H10, M15
 * (Connection-Ebene, siehe SYBASE_TODO.md).
 */
import { Connection } from '../../../src/connection';
import { SybaseError } from '../../../src/error';
import { RawSocket, TdsTimeoutError } from '../../../src/protocol/tds-socket';
import { TdsWriter } from '../../../src/protocol/tds-writer';
import { DoneStatus, TokenType, EnvType, PduType } from '../../../src/constants/tds-const';
import { loginAckBuf, doneBuf, eedBuf, queryResponseBuf } from '../mock-socket';

// ---------------------------------------------------------------------------
// ManualSocket: Antworten werden erst auf respond() ausgeliefert
// ---------------------------------------------------------------------------

function packet(body: Buffer, pdu = 0x04): Buffer {
  const pkt = Buffer.alloc(8 + body.length);
  pkt[0] = pdu; pkt[1] = 0x01;
  pkt.writeUInt16BE(pkt.length, 2);
  body.copy(pkt, 8);
  return pkt;
}

class ManualSocket implements RawSocket {
  written: Buffer[] = [];
  destroyed = false;
  private listeners: Record<string, ((...a: any[]) => void)[]> = {};
  /** Antworten, die automatisch auf den nächsten write() folgen (für den Login). */
  auto: Buffer[] = [];

  write(data: Buffer, cb?: (err?: Error | null) => void): boolean {
    this.written.push(Buffer.from(data));
    cb?.(null);
    // Nur nach dem letzten Paket einer Nachricht (EOM) automatisch antworten
    if ((data[1] & 0x01) && this.auto.length) this.respond(this.auto.shift()!);
    return true;
  }
  end(): this { this.emit('close', false); return this; }
  destroy(): void { this.destroyed = true; }
  on(ev: string, l: (...a: any[]) => void): this { (this.listeners[ev] ??= []).push(l); return this; }
  emit(ev: string, ...a: unknown[]) { (this.listeners[ev] ?? []).forEach(l => l(...a)); }
  respond(body: Buffer) { this.emit('data', packet(body)); }
  /** Pakete eines bestimmten PDU-Typs */
  sent(pdu: number) { return this.written.filter(w => w[0] === pdu); }
}

function envChangeBuf(type: number, newVal: string, oldVal = ''): Buffer {
  const n = Buffer.from(newVal), o = Buffer.from(oldVal);
  const w = new TdsWriter();
  w.writeUInt8(TokenType.ENVCHANGE);
  w.writeUInt16BE(1 + 1 + n.length + 1 + o.length);
  w.writeUInt8(type); w.writeUInt8(n.length); w.writeBytes(n); w.writeUInt8(o.length); w.writeBytes(o);
  return w.toBuffer();
}

async function connect(sock: ManualSocket, opts: object = {}) {
  sock.auto.push(Buffer.concat([loginAckBuf(), doneBuf()]), doneBuf());
  return new Connection({ host: 'x', username: 'sa', ...opts }, sock).connect();
}

const flush = () => new Promise(r => setImmediate(r));

// ===========================================================================

describe('K4 – Requests werden pro Connection serialisiert', () => {
  it('zweite Query wird erst nach vollständiger erster Antwort gesendet', async () => {
    const sock = new ManualSocket();
    const conn = await connect(sock);
    const before = sock.written.length;

    const q1 = conn.query('select 1');
    const q2 = conn.query('select 2');
    await flush();
    expect(sock.written.length).toBe(before + 1); // nur q1 gesendet

    sock.respond(queryResponseBuf(1, 'a'));
    await flush();
    expect(sock.written.length).toBe(before + 2); // jetzt q2

    sock.respond(queryResponseBuf(2, 'b'));
    expect((await q1).rows[0][0]).toBe(1);
    expect((await q2).rows[0][0]).toBe(2);
  });

  it('Fehler einer Query blockiert die Queue nicht', async () => {
    const sock = new ManualSocket();
    const conn = await connect(sock);
    const q1 = conn.query('bad');
    const q2 = conn.query('select 2');
    await flush();
    sock.respond(Buffer.concat([eedBuf(208, 'nope'), doneBuf(DoneStatus.ERROR)]));
    await expect(q1).rejects.toBeInstanceOf(SybaseError);
    await flush();
    sock.respond(queryResponseBuf(2, 'b'));
    expect((await q2).rows[0][0]).toBe(2);
  });
});

describe('H10 – Ergebnis-/Fehlerbehandlung', () => {
  it('Fehler wird erst nach dem finalen DONE geworfen (Stream bleibt synchron)', async () => {
    const sock = new ManualSocket();
    const conn = await connect(sock);
    const q1 = conn.query('a; b');
    await flush();
    // Fehler im ersten Statement, Rest der Antwort in einer zweiten Nachricht
    sock.respond(Buffer.concat([eedBuf(208, 'weg'), doneBuf(DoneStatus.ERROR | DoneStatus.MORE)]));
    await flush();
    sock.respond(queryResponseBuf(7, 'x'));
    await expect(q1).rejects.toThrow('weg');

    const q2 = conn.query('select 9');
    await flush();
    sock.respond(queryResponseBuf(9, 'y'));
    expect((await q2).rows[0][0]).toBe(9); // nicht die Reste von q1
  });

  it('mehrere Resultsets werden getrennt geliefert', async () => {
    const sock = new ManualSocket();
    const conn = await connect(sock);
    const q = conn.query('select 1; select 2');
    await flush();
    const first = queryResponseBuf(1, 'a');
    const firstMore = Buffer.from(first);
    // DONE des ersten Resultsets auf MORE setzen
    firstMore.writeUInt16BE(DoneStatus.COUNT | DoneStatus.MORE, firstMore.length - 8);
    sock.respond(Buffer.concat([firstMore, queryResponseBuf(2, 'b')]));
    const r = await q;
    expect(r.resultSets).toHaveLength(2);
    expect(r.rows).toEqual([[1, 'a']]);
    expect(r.resultSets[1].rows).toEqual([[2, 'b']]);
  });

  it('Info-Meldungen (Severity < 11) landen in messages', async () => {
    const sock = new ManualSocket();
    const conn = await connect(sock);
    const q = conn.query("print 'hi'");
    await flush();
    sock.respond(Buffer.concat([eedBuf(0, 'hi', 10), doneBuf()]));
    const r = await q;
    expect(r.messages.map(m => m.message)).toEqual(['hi']);
  });

  it('DONE_ERROR ohne EED wirft', async () => {
    const sock = new ManualSocket();
    const conn = await connect(sock);
    const q = conn.query('x');
    await flush();
    sock.respond(doneBuf(DoneStatus.ERROR));
    await expect(q).rejects.toThrow(/DONE_ERROR/);
  });

  it('RETURNSTATUS wird geliefert', async () => {
    const sock = new ManualSocket();
    const conn = await connect(sock);
    const q = conn.query('exec p');
    await flush();
    const rs = Buffer.alloc(5); rs[0] = TokenType.RETURNSTATUS; rs.writeInt32BE(3, 1);
    sock.respond(Buffer.concat([rs, doneBuf()]));
    expect((await q).returnStatus).toBe(3);
  });

  it('inTransaction folgt dem DONE_INXACT-Flag', async () => {
    const sock = new ManualSocket();
    const conn = await connect(sock);
    const q = conn.query('begin tran');
    await flush();
    sock.respond(doneBuf(DoneStatus.INXACT));
    await q;
    expect(conn.inTransaction).toBe(true);
  });
});

describe('H6 – Timeouts und Abbruch', () => {
  it('requestTimeout sendet ATTENTION und Connection bleibt nutzbar', async () => {
    const sock = new ManualSocket();
    const conn = await connect(sock, { requestTimeout: 30 });
    const q = conn.query('waitfor delay "01:00:00"');
    const assertion = expect(q).rejects.toBeInstanceOf(TdsTimeoutError);
    await new Promise(r => setTimeout(r, 50));
    // ATTN wurde gesendet → Server bestätigt mit DONE_ATTN; erst dann lehnt query() ab
    expect(sock.sent(PduType.BUF_ATTN)).toHaveLength(1);
    sock.respond(doneBuf(DoneStatus.ATTN));
    await assertion;

    const q2 = conn.query('select 1');
    await flush();
    sock.respond(queryResponseBuf(1, 'ok'));
    expect((await q2).rows[0][1]).toBe('ok');
    expect(conn.isClosed).toBe(false);
  });

  it('ohne ATTN-Bestätigung wird die Connection als kaputt markiert', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    try {
      const sock = new ManualSocket();
      const conn = await connect(sock, { requestTimeout: 30 });
      const q = conn.query('x');
      const assertion = expect(q).rejects.toBeInstanceOf(TdsTimeoutError);
      await jest.advanceTimersByTimeAsync(31);
      await jest.advanceTimersByTimeAsync(5_001);
      await assertion;
      expect(conn.isClosed).toBe(true);
      await expect(conn.query('y')).rejects.toThrow(/nicht mehr nutzbar/);
    } finally {
      jest.useRealTimers();
    }
  });

  it('Login ohne Antwort läuft in connectTimeout', async () => {
    const sock = new ManualSocket();
    await expect(
      new Connection({ host: 'x', username: 'sa', connectTimeout: 30 }, sock).connect(),
    ).rejects.toBeInstanceOf(TdsTimeoutError);
  });

  it('geschlossener Socket → isClosed und klare Fehlermeldung', async () => {
    const sock = new ManualSocket();
    const conn = await connect(sock);
    sock.emit('close', true);
    expect(conn.isClosed).toBe(true);
    await expect(conn.query('x')).rejects.toThrow();
  });
});

describe('H9 – ENVCHANGE wird ausgewertet', () => {
  it('Server-Charset iso_1 → Latin-1-Decodierung', async () => {
    const sock = new ManualSocket();
    sock.auto.push(Buffer.concat([loginAckBuf(), envChangeBuf(EnvType.CHARSET, 'iso_1', 'utf8'), doneBuf()]), doneBuf());
    const conn = await new Connection({ host: 'x', username: 'sa' }, sock).connect();
    expect(conn.encoding).toBe('latin1');

    const q = conn.query('select name');
    await flush();
    // Query-Text wird Latin-1 gesendet
    const lastPkt = sock.written[sock.written.length - 1];
    expect(lastPkt.includes(Buffer.from('select name', 'latin1'))).toBe(true);
    // 'Müller' in Latin-1 = 6 Bytes
    const resp = queryResponseBuf(1, 'X');
    const lat = Buffer.from('Müller', 'latin1');
    const patched = Buffer.concat([
      resp.subarray(0, resp.length - 9 - 2),           // bis vor [len][X]
      Buffer.from([lat.length]), lat,
      resp.subarray(resp.length - 9),                    // DONE
    ]);
    sock.respond(patched);
    expect((await q).rows[0][1]).toBe('Müller');
  });

  it('nicht unterstützter Server-Charset bricht den Login ab', async () => {
    const sock = new ManualSocket();
    sock.auto.push(Buffer.concat([loginAckBuf(), envChangeBuf(EnvType.CHARSET, 'roman8'), doneBuf()]));
    await expect(new Connection({ host: 'x', username: 'sa' }, sock).connect()).rejects.toThrow(/roman8/);
  });

  it('ENVCHANGE PACKETSIZE wird übernommen', async () => {
    const sock = new ManualSocket();
    sock.auto.push(Buffer.concat([loginAckBuf(), envChangeBuf(EnvType.PACKETSIZE, '2048', '512'), doneBuf()]), doneBuf());
    const conn = await new Connection({ host: 'x', username: 'sa' }, sock).connect();
    const before = sock.written.length;
    const q = conn.query('select ' + 'x'.repeat(1500));
    await flush();
    expect(sock.written.length).toBe(before + 1); // 1 Paket statt 3 bei 512
    sock.respond(doneBuf());
    await q;
  });

  it('database-Option sendet use <db>; ungültiger Name wird abgelehnt', async () => {
    const sock = new ManualSocket();
    sock.auto.push(Buffer.concat([loginAckBuf(), doneBuf()]), doneBuf(), Buffer.concat([envChangeBuf(EnvType.DB, 'lhlue', 'master'), doneBuf()]));
    const conn = await new Connection({ host: 'x', username: 'sa', database: 'lhlue' }, sock).connect();
    expect(sock.written[sock.written.length - 1].includes(Buffer.from('use lhlue'))).toBe(true);
    expect(conn.database).toBe('lhlue');

    const sock2 = new ManualSocket();
    sock2.auto.push(Buffer.concat([loginAckBuf(), doneBuf()]), doneBuf());
    await expect(
      new Connection({ host: 'x', username: 'sa', database: 'x; drop table y' }, sock2).connect(),
    ).rejects.toThrow(/Datenbankname/);
  });
});

describe('M15 – query() mit Parametern', () => {
  it('nutzt PREPARE → EXECUTE → DEALLOCATE', async () => {
    const sock = new ManualSocket();
    const conn = await connect(sock);
    const before = sock.written.length;
    sock.auto.push(doneBuf(), queryResponseBuf(5, 'z'), doneBuf());
    const r = await conn.query('select * from t where id = ?', [5]);
    expect(r.rows[0][0]).toBe(5);
    const sentTokens = sock.written.slice(before).map(p => p[8]);
    expect(sentTokens).toEqual([TokenType.DYNAMIC, TokenType.DYNAMIC, TokenType.DYNAMIC]);
  });
});

describe('end()', () => {
  it('ist idempotent', async () => {
    const sock = new ManualSocket();
    const conn = await connect(sock);
    await conn.end();
    await conn.end();
    expect(sock.sent(PduType.BUF_LOGOUT)).toHaveLength(1);
    expect(conn.isClosed).toBe(true);
  });
});
