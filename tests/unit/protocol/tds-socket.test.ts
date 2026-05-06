import { EventEmitter } from 'events';
import { TdsSocket, RawSocket } from '../../../src/protocol/tds-socket';
import { TdsPacket } from '../../../src/protocol/tds-packet';
import { PduType } from '../../../src/constants/tds-const';

// ---------------------------------------------------------------------------
// Mock-Socket: EventEmitter + write-Capture
// ---------------------------------------------------------------------------

class MockSocket extends EventEmitter implements RawSocket {
  public written: Buffer[] = [];
  public ended = false;

  write(data: Buffer, callback?: (err?: Error | null) => void): boolean {
    this.written.push(Buffer.from(data));
    callback?.();
    return true;
  }

  end(): this {
    this.ended = true;
    return this;
  }

  destroy(_err?: Error): void {
    this.ended = true;
  }

  /** Gibt alle bisher geschriebenen Bytes als einen Buffer zurück */
  get writtenData(): Buffer {
    return Buffer.concat(this.written);
  }

  /** Simuliert eingehende Daten vom Server */
  pushData(data: Buffer): void {
    this.emit('data', data);
  }

  /** Simuliert einen Socket-Fehler */
  pushError(err: Error): void {
    this.emit('error', err);
  }

  /** Simuliert das Schließen der Verbindung */
  pushClose(): void {
    this.emit('close', false);
  }
}

// ---------------------------------------------------------------------------
// Hilfsfunktion: erstellt einen TDS-Paket-Buffer mit gegebenem Body
// ---------------------------------------------------------------------------
function makePacketBuf(
  body: Buffer,
  isLast = true,
  packetNumber = 1,
  pduType = PduType.BUF_LANG,
): Buffer {
  return new TdsPacket(pduType, body, packetNumber, isLast).toBuffer();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TdsSocket', () => {
  let mock: MockSocket;
  let socket: TdsSocket;

  beforeEach(() => {
    mock   = new MockSocket();
    socket = new TdsSocket(mock);
  });

  // -----------------------------------------------------------------------
  // send()
  // -----------------------------------------------------------------------

  describe('send()', () => {
    it('sendet einen einzelnen Packet wenn Body <= packetSize-8', async () => {
      const data = Buffer.from('SELECT 1');
      await socket.send(PduType.BUF_LANG, data);

      const written = mock.writtenData;
      expect(written).toHaveLength(TdsPacket.HEADER_SIZE + data.length);
      expect(written[0]).toBe(PduType.BUF_LANG);
      expect(written[1]).toBe(0x01);                            // EOM
      expect(written.readUInt16BE(2)).toBe(TdsPacket.HEADER_SIZE + data.length);
      expect(written.slice(TdsPacket.HEADER_SIZE)).toEqual(data);
    });

    it('splittet große Daten in mehrere Pakete', async () => {
      socket.packetSize = 20; // maxBody = 12
      // 14 Bytes → genau 2 Pakete: 12 + 2
      const data = Buffer.alloc(14, 0xAB);

      await socket.send(PduType.BUF_LANG, data);

      expect(mock.written).toHaveLength(2);

      // Paket 1: 12 Bytes Body, Status 0x00 (nicht letztes)
      const firstPacket = TdsPacket.fromBuffer(mock.written[0]);
      expect(firstPacket.body).toHaveLength(12);
      expect(firstPacket.isLast).toBe(false);
      expect(firstPacket.packetNumber).toBe(1);

      // Paket 2: 2 Bytes Body, Status 0x01 (letztes)
      const secondPacket = TdsPacket.fromBuffer(mock.written[1]);
      expect(secondPacket.body).toHaveLength(2);
      expect(secondPacket.isLast).toBe(true);
      expect(secondPacket.packetNumber).toBe(2);
    });

    it('sendet leeren Body als einzelnes Paket mit EOM', async () => {
      await socket.send(PduType.BUF_LANG, Buffer.alloc(0));
      expect(mock.written).toHaveLength(1);
      expect(mock.writtenData[1]).toBe(0x01); // EOM
    });

    it('setzt PDU-Typ in allen Teil-Paketen korrekt', async () => {
      socket.packetSize = 16; // maxBody = 8
      await socket.send(PduType.BUF_RPC, Buffer.alloc(20, 0x00));
      for (const chunk of mock.written) {
        expect(chunk[0]).toBe(PduType.BUF_RPC);
      }
    });

    it('Body der Teil-Pakete ergibt zusammengesetzt den Original-Buffer', async () => {
      socket.packetSize = 16; // maxBody = 8
      const data = Buffer.from('ABCDEFGHIJKLMNOP'); // 16 Bytes → 2 Pakete
      await socket.send(PduType.BUF_LANG, data);

      const parts = mock.written.map((chunk) => TdsPacket.fromBuffer(chunk).body);
      expect(Buffer.concat(parts)).toEqual(data);
    });
  });

  // -----------------------------------------------------------------------
  // receive()
  // -----------------------------------------------------------------------

  describe('receive()', () => {
    it('gibt eine vollständige Nachricht zurück (EOM=1)', async () => {
      const body = Buffer.from([0xDE, 0xAD]);
      const receivePromise = socket.receive();
      mock.pushData(makePacketBuf(body, true));

      const msg = await receivePromise;
      expect(msg.pduType).toBe(PduType.BUF_LANG);
      expect(msg.data).toEqual(body);
    });

    it('assembliert eine mehrteilige Nachricht (EOM=0 + EOM=1)', async () => {
      const part1 = Buffer.from([0x01, 0x02, 0x03]);
      const part2 = Buffer.from([0x04, 0x05, 0x06]);

      const receivePromise = socket.receive();
      mock.pushData(makePacketBuf(part1, false, 1));
      mock.pushData(makePacketBuf(part2, true, 2));

      const msg = await receivePromise;
      expect(msg.data).toEqual(Buffer.concat([part1, part2]));
    });

    it('assembliert drei Teilpakete korrekt', async () => {
      const parts = [
        Buffer.from([0xAA]),
        Buffer.from([0xBB]),
        Buffer.from([0xCC]),
      ];
      const receivePromise = socket.receive();
      mock.pushData(makePacketBuf(parts[0], false, 1));
      mock.pushData(makePacketBuf(parts[1], false, 2));
      mock.pushData(makePacketBuf(parts[2], true, 3));

      const msg = await receivePromise;
      expect(msg.data).toEqual(Buffer.concat(parts));
    });

    it('verarbeitet fragmentierten Header (Daten kommen in Stücken)', async () => {
      const body = Buffer.from([0xAA, 0xBB]);
      const fullBuf = makePacketBuf(body, true);

      const receivePromise = socket.receive();
      // Sendet erst die ersten 4 Bytes (unvollständiger Header)
      mock.pushData(fullBuf.slice(0, 4));
      // Danach den Rest
      mock.pushData(fullBuf.slice(4));

      const msg = await receivePromise;
      expect(msg.data).toEqual(body);
    });

    it('verarbeitet fragmentierten Body (Header vollständig, Body aufgeteilt)', async () => {
      const body = Buffer.alloc(10, 0xCC);
      const fullBuf = makePacketBuf(body, true);

      const receivePromise = socket.receive();
      // Header komplett + halber Body
      mock.pushData(fullBuf.slice(0, TdsPacket.HEADER_SIZE + 5));
      // Zweite Hälfte des Body
      mock.pushData(fullBuf.slice(TdsPacket.HEADER_SIZE + 5));

      const msg = await receivePromise;
      expect(msg.data).toEqual(body);
    });

    it('verarbeitet zwei aufeinanderfolgende Nachrichten im selben Chunk', async () => {
      const body1 = Buffer.from([0x01]);
      const body2 = Buffer.from([0x02]);
      const combined = Buffer.concat([
        makePacketBuf(body1, true, 1),
        makePacketBuf(body2, true, 1, PduType.BUF_RPC),
      ]);

      const p1 = socket.receive();
      const p2 = socket.receive();
      mock.pushData(combined);

      const [msg1, msg2] = await Promise.all([p1, p2]);
      expect(msg1.data).toEqual(body1);
      expect(msg1.pduType).toBe(PduType.BUF_LANG);
      expect(msg2.data).toEqual(body2);
      expect(msg2.pduType).toBe(PduType.BUF_RPC);
    });

    it('puffert Nachrichten wenn kein Empfänger wartet', async () => {
      const body = Buffer.from([0xFF]);
      mock.pushData(makePacketBuf(body, true));

      // receive() erst NACH dem Eintreffen der Daten aufrufen
      const msg = await socket.receive();
      expect(msg.data).toEqual(body);
    });

    it('lehnt pending receive() bei Socket-Fehler ab', async () => {
      const receivePromise = socket.receive();
      const error = new Error('ECONNRESET');
      mock.pushError(error);

      await expect(receivePromise).rejects.toThrow('ECONNRESET');
    });

    it('lehnt pending receive() beim Schließen der Verbindung ab', async () => {
      const receivePromise = socket.receive();
      mock.pushClose();

      await expect(receivePromise).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // close()
  // -----------------------------------------------------------------------

  describe('close()', () => {
    it('ruft end() auf dem Socket auf', async () => {
      await socket.close();
      expect(mock.ended).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // packetSize
  // -----------------------------------------------------------------------

  describe('packetSize', () => {
    it('Standard-Paketgröße ist 512', () => {
      expect(socket.packetSize).toBe(512);
    });

    it('kann nach der Verbindung angepasst werden (nach ENVCHANGE)', () => {
      socket.packetSize = 4096;
      expect(socket.packetSize).toBe(4096);
    });
  });
});
