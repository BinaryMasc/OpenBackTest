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
    const message = JSON.parse(payload) as { type: string; requestId?: string; order?: { symbol: string; side: 'buy' | 'sell'; quantity: number }; accountId?: string };
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
    if (message.type === 'accounts') {
      queueMicrotask(() => this.onmessage?.({
        data: JSON.stringify({
          type: 'accounts',
          requestId: message.requestId,
          accounts: [{ id: 'acct-1', fcmId: 'FCM', ibId: 'IB', displayName: 'acct-1 · FCM' }]
        })
      } as MessageEvent<string>));
    }
    if (message.type === 'accountState') {
      queueMicrotask(() => this.onmessage?.({
        data: JSON.stringify({
          type: 'accountState',
          requestId: message.requestId,
          state: {
            account: { id: message.accountId || 'acct-1' },
            balance: 10000,
            equity: 10500,
            realizedPnL: 250,
            unrealizedPnL: 250,
            positions: [],
            orders: [],
            statistics: { dailyPnL: 500, openPositions: 0, workingOrders: 0, updatedAt: 1000 },
            updatedAt: 1000
          }
        })
      } as MessageEvent<string>));
    }
    if (message.type === 'order') {
      queueMicrotask(() => this.onmessage?.({
        data: JSON.stringify({
          type: 'orderUpdate',
          requestId: message.requestId,
          update: {
            orderId: 'order-1',
            accountId: 'acct-1',
            symbol: message.order?.symbol,
            side: message.order?.side,
            quantity: message.order?.quantity,
            orderType: 'market',
            status: 'working',
            filledQuantity: 0
          }
        })
      } as MessageEvent<string>));
    }
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

class ManualWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: ManualWebSocket[] = [];

  readonly sent: string[] = [];
  readonly url: string;
  readyState = ManualWebSocket.CONNECTING;
  closeCalls = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    ManualWebSocket.instances.push(this);
    queueMicrotask(() => {
      if (this.readyState !== ManualWebSocket.CONNECTING) return;
      this.readyState = ManualWebSocket.OPEN;
      this.onopen?.(new Event('open'));
    });
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.closeCalls += 1;
    if (this.readyState === ManualWebSocket.CLOSED) return;
    this.readyState = ManualWebSocket.CLOSED;
    this.onclose?.({ code: 1000, reason: '' } as CloseEvent);
  }

  emitMessage(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent<string>);
  }

  emitClose(code = 1006, reason = '') {
    this.readyState = ManualWebSocket.CLOSED;
    this.onclose?.({ code, reason } as CloseEvent);
  }
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('RithmicService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeWebSocket.lastInstance = null;
    ManualWebSocket.instances = [];
    vi.useRealTimers();
  });

  it('opens the local gateway with credentials and requests history', async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);

    const connection = await RithmicService.connect({
      credentials: { username: 'test-user', password: 'test-password', gatewayUrl: 'http://127.0.0.1:8765' }
    });
    const symbols = await connection.listSymbols();
    const candles = await connection.fetchHistoricalCandles('ESU6.CME', '1m', 1);

    expect(symbols[0].symbol).toBe('ESU6.CME');
    expect(candles).toHaveLength(1);
    expect(FakeWebSocket.lastInstance?.url).toBe('ws://127.0.0.1:8765');
    expect(FakeWebSocket.lastInstance?.sent.map(JSON.parse)).toEqual([
      { type: 'connect', credentials: { username: 'test-user', password: 'test-password' } },
      expect.objectContaining({ type: 'history', symbol: 'ESU6.CME', interval: '1m', limit: 1 })
    ]);

    connection.close();
  });

  it('requires both Rithmic credential fields', async () => {
    await expect(RithmicService.connect({ credentials: { username: 'test-user' } })).rejects.toThrow('password');
  });

  it('accepts a successful login response that arrives after the old 30-second deadline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', ManualWebSocket);

    const connectionPromise = RithmicService.connect({
      credentials: { username: 'test-user', password: 'test-password' }
    });
    await flushMicrotasks();

    const socket = ManualWebSocket.instances[0];
    expect(socket.sent.map(JSON.parse)).toEqual([
      { type: 'connect', credentials: { username: 'test-user', password: 'test-password' } }
    ]);

    await vi.advanceTimersByTimeAsync(33_000);
    socket.emitMessage({ type: 'connected', symbols: [] });

    await expect(connectionPromise).resolves.toMatchObject({ sourceId: 'rithmic' });
  });

  it('rejects immediately when the gateway closes before the login acknowledgement', async () => {
    vi.stubGlobal('WebSocket', ManualWebSocket);

    const connectionPromise = RithmicService.connect({
      credentials: { username: 'test-user', password: 'test-password' }
    });
    await flushMicrotasks();

    ManualWebSocket.instances[0].emitClose(1006, 'network lost');

    await expect(connectionPromise).rejects.toThrow('closed before login completed');
  });

  it('closes and rejects an in-flight login when its signal is aborted', async () => {
    vi.stubGlobal('WebSocket', ManualWebSocket);
    const controller = new AbortController();

    const connectionPromise = RithmicService.connect({
      credentials: { username: 'test-user', password: 'test-password' },
      signal: controller.signal
    });
    await flushMicrotasks();

    const socket = ManualWebSocket.instances[0];
    controller.abort();

    await expect(connectionPromise).rejects.toMatchObject({ name: 'AbortError' });
    expect(socket.closeCalls).toBe(1);
  });

  it('exposes account discovery and execution through the authenticated connection', async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);

    const connection = await RithmicService.connect({
      credentials: { username: 'test-user', password: 'test-password' }
    });
    const execution = connection.getExecutionConnection?.();

    expect(execution).toBeDefined();
    const accounts = await execution!.listAccounts();
    const state = await execution!.getAccountState('acct-1');
    const update = await execution!.placeOrder({
      accountId: 'acct-1',
      symbol: 'ESU6.CME',
      side: 'buy',
      quantity: 1,
      orderType: 'market'
    });

    expect(accounts).toEqual([{ id: 'acct-1', fcmId: 'FCM', ibId: 'IB', displayName: 'acct-1 · FCM' }]);
    expect(state.equity).toBe(10500);
    expect(update.orderId).toBe('order-1');
    expect(FakeWebSocket.lastInstance?.sent.map(JSON.parse)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'accounts' }),
      expect.objectContaining({ type: 'accountState', accountId: 'acct-1' }),
      expect.objectContaining({
        type: 'order',
        order: expect.objectContaining({ accountId: 'acct-1', symbol: 'ESU6.CME', side: 'buy', quantity: 1 })
      })
    ]));

    connection.close();
  });
});
