import { afterEach, describe, expect, it, vi } from 'vitest';
import { RithmicService } from '../../src/services/rithmic';

class FakeWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static lastInstance: FakeWebSocket | null = null;

  readonly sent: string[] = [];
  readonly url: string;
  readyState = FakeWebSocket.OPEN;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.lastInstance = this;
    queueMicrotask(() => this.onopen?.(new Event('open')));
  }

  send(payload: string) {
    this.sent.push(payload);
    const message = JSON.parse(payload) as { type: string; requestId?: string };
    if (message.type === 'connect') {
      queueMicrotask(() => this.onmessage?.({
        data: JSON.stringify({
          type: 'connected',
          symbols: [{ symbol: 'ESU6.CME', displayName: 'ESU6', exchange: 'CME', assetType: 'futures' }]
        })
      } as MessageEvent<string>));
    }
    if (message.type === 'history') {
      queueMicrotask(() => this.onmessage?.({
        data: JSON.stringify({
          type: 'history',
          requestId: message.requestId,
          candles: [{ time: 1000, open: 1, high: 2, low: 1, close: 2, volume: 3 }]
        })
      } as MessageEvent<string>));
    }
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

describe('RithmicService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeWebSocket.lastInstance = null;
  });

  it('opens the local gateway with credentials and requests history', async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);

    const connection = await RithmicService.connect({
      credentials: { username: 'test-user', password: 'test-password' }
    });
    const symbols = await connection.listSymbols();
    const candles = await connection.fetchHistoricalCandles('ESU6.CME', '1m', 1);

    expect(symbols[0].symbol).toBe('ESU6.CME');
    expect(candles).toHaveLength(1);
    expect(FakeWebSocket.lastInstance?.sent.map(JSON.parse)).toEqual([
      { type: 'connect', credentials: { username: 'test-user', password: 'test-password' } },
      expect.objectContaining({ type: 'history', symbol: 'ESU6.CME', interval: '1m', limit: 1 })
    ]);

    connection.close();
  });

  it('requires both Rithmic credential fields', async () => {
    await expect(RithmicService.connect({ credentials: { username: 'test-user' } })).rejects.toThrow('password');
  });
});
