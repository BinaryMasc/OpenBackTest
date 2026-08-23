import type { Candle, MarketSymbol } from '../types';
import type {
  ExecutionAccount,
  ExecutionAccountState,
  ExecutionConnection,
  ExecutionFill,
  OrderRequest,
  OrderUpdate,
} from './execution';
import type {
  MarketDataConnection,
  MarketDataConnectionOptions,
  MarketDataSource,
  MarketDataSubscription,
  MarketDataConnectionStatus
} from './marketData';

export const RITHMIC_SOURCE_ID = 'rithmic';
export const RITHMIC_SOURCE_NAME = 'Rithmic';
export const DEFAULT_RITHMIC_GATEWAY_ADDRESS = 'http://127.0.0.1:8765';
// A Rithmic login can take longer than a browser WebSocket upgrade: the
// gateway must authenticate its repository and market-data sessions, then
// resolve its configured symbol metadata (up to roughly 195 seconds in the
// documented worst case), before it can acknowledge the browser.
const RITHMIC_CONNECT_TIMEOUT_MS = 240_000;

export interface RithmicCredentials {
  username: string;
  password: string;
  /** HTTP is accepted in the form; the WebSocket transport is normalized below. */
  gatewayUrl?: string;
}

interface GatewayMessage {
  type: string;
  requestId?: string;
  message?: string;
  symbols?: MarketSymbol[];
  candles?: Candle[];
  candle?: Candle;
  accounts?: ExecutionAccount[];
  state?: ExecutionAccountState;
  update?: OrderUpdate;
  fill?: ExecutionFill;
}

function getGatewayUrl(options?: MarketDataConnectionOptions): string {
  const configuredUrl = options?.settings?.gatewayUrl ?? options?.credentials?.gatewayUrl;
  const address = typeof configuredUrl === 'string' && configuredUrl.trim().length > 0
    ? configuredUrl.trim()
    : import.meta.env.VITE_RITHMIC_GATEWAY_URL || DEFAULT_RITHMIC_GATEWAY_ADDRESS;
  if (address.startsWith('http://')) return `ws://${address.slice('http://'.length)}`;
  if (address.startsWith('https://')) return `wss://${address.slice('https://'.length)}`;
  if (address.startsWith('ws://') || address.startsWith('wss://')) return address;
  return `ws://${address}`;
}

function getCredentials(options?: MarketDataConnectionOptions): RithmicCredentials {
  const credentials = options?.credentials;
  const result = {
    username: credentials?.username || '',
    password: credentials?.password || ''
  };
  const missing = (['username', 'password'] as const).filter(key => !result[key]);
  if (missing.length > 0) {
    throw new Error(`Missing Rithmic connection fields: ${missing.join(', ')}`);
  }
  return result;
}

function createRequestId(): string {
  return `rithmic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createAbortError(): Error {
  const error = new Error('Rithmic gateway connection was cancelled');
  error.name = 'AbortError';
  return error;
}

class RithmicGatewayConnection implements MarketDataConnection, ExecutionConnection {
  readonly sourceId = RITHMIC_SOURCE_ID;
  readonly sourceName = RITHMIC_SOURCE_NAME;

  private readonly socket: WebSocket;
  private readonly symbols: MarketSymbol[];
  private readonly candleHandlers = new Set<(candle: Candle) => void>();
  private readonly statusHandlers = new Set<(status: MarketDataConnectionStatus) => void>();
  private readonly pendingCandles = new Map<string, Candle>();
  private readonly candleFlushTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly accountHandlers = new Map<string, Set<(state: ExecutionAccountState) => void>>();
  private readonly orderHandlers = new Set<(update: OrderUpdate) => void>();
  private readonly fillHandlers = new Set<(fill: ExecutionFill) => void>();
  private readonly pending = new Map<string, {
    resolve: (message: GatewayMessage) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();

  private constructor(socket: WebSocket, symbols: MarketSymbol[]) {
    this.socket = socket;
    this.symbols = symbols;

    socket.onmessage = event => {
      const message = JSON.parse(String(event.data)) as GatewayMessage;
      if (message.type === 'candle' && message.candle) {
        this.queueCandle(message.candle);
        return;
      }

      if (message.type === 'accountState' && message.state) {
        const handlers = this.accountHandlers.get(message.state.account.id);
        handlers?.forEach(handler => handler(message.state!));
      }
      if (message.type === 'orderUpdate' && message.update) {
        this.orderHandlers.forEach(handler => handler(message.update!));
      }
      if (message.type === 'fill' && message.fill) {
        this.fillHandlers.forEach(handler => handler(message.fill!));
      }

      if (!message.requestId) return;
      const request = this.pending.get(message.requestId);
      if (!request) return;
      clearTimeout(request.timeout);
      this.pending.delete(message.requestId);
      if (message.type === 'error') {
        request.reject(new Error(message.message || 'Rithmic gateway request failed'));
      } else {
        request.resolve(message);
      }
    };

    socket.onclose = () => {
      this.statusHandlers.forEach(handler => handler('disconnected'));
      this.statusHandlers.clear();
      this.pending.forEach(request => {
        clearTimeout(request.timeout);
        request.reject(new Error('Rithmic gateway disconnected'));
      });
      this.pending.clear();
    };
  }

  static connect(
    credentials: RithmicCredentials,
    gatewayUrl: string,
    signal?: AbortSignal
  ): Promise<RithmicGatewayConnection> {
    if (signal?.aborted) return Promise.reject(createAbortError());

    return new Promise((resolve, reject) => {
      let socket: WebSocket;
      try {
        socket = new WebSocket(gatewayUrl);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(`Could not reach the Rithmic gateway at ${gatewayUrl}`));
        return;
      }

      let settled = false;
      let connectTimeout: ReturnType<typeof setTimeout> | null = null;

      const closeSocket = () => {
        if (socket.readyState !== WebSocket.CLOSING && socket.readyState !== WebSocket.CLOSED) {
          try {
            socket.close();
          } catch {
            // A browser may reject close() while constructing a failed socket.
          }
        }
      };

      const cleanup = () => {
        if (connectTimeout) clearTimeout(connectTimeout);
        signal?.removeEventListener('abort', onAbort);
      };

      const rejectConnection = (error: Error, shouldClose = true) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (shouldClose) closeSocket();
        reject(error);
      };

      const onAbort = () => rejectConnection(createAbortError());

      connectTimeout = setTimeout(() => {
        rejectConnection(new Error(`Rithmic gateway did not respond at ${gatewayUrl}`));
      }, RITHMIC_CONNECT_TIMEOUT_MS);

      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) {
        onAbort();
        return;
      }

      socket.onerror = () => {
        rejectConnection(new Error(`Could not reach the Rithmic gateway at ${gatewayUrl}`));
      };

      socket.onclose = event => {
        const detail = event?.reason || (event?.code ? ` (code ${event.code})` : '');
        rejectConnection(new Error(`Rithmic gateway closed before login completed${detail}`), false);
      };

      socket.onopen = () => {
        if (signal?.aborted) {
          onAbort();
          return;
        }
        try {
          socket.send(JSON.stringify({ type: 'connect', credentials }));
        } catch (error) {
          rejectConnection(error instanceof Error ? error : new Error('Could not send the Rithmic login request'));
        }
      };

      socket.onmessage = event => {
        let message: GatewayMessage;
        try {
          message = JSON.parse(String(event.data)) as GatewayMessage;
        } catch {
          rejectConnection(new Error('Rithmic gateway returned an invalid login response'));
          return;
        }

        if (message.type === 'connected') {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(new RithmicGatewayConnection(socket, message.symbols || []));
        } else if (message.type === 'error' && !settled) {
          rejectConnection(new Error(message.message || 'Rithmic login failed'));
        }
      };
    });
  }

  listSymbols = async (): Promise<MarketSymbol[]> => this.symbols;

  fetchHistoricalCandles = async (symbol: string, interval = '1m', limit = 1000): Promise<Candle[]> => {
    const response = await this.request({ type: 'history', symbol, interval, limit });
    return response.candles || [];
  };

  subscribeCandles = (symbol: string, interval: string, onCandle: (candle: Candle) => void): MarketDataSubscription => {
    this.candleHandlers.add(onCandle);
    this.socket.send(JSON.stringify({ type: 'subscribe', symbol, interval }));
    return {
      close: () => {
        this.candleHandlers.delete(onCandle);
        if (this.candleHandlers.size === 0 && this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({ type: 'unsubscribe', symbol, interval }));
        }
      }
    };
  };

  subscribeStatus = (onStatusChange: (status: MarketDataConnectionStatus) => void): MarketDataSubscription => {
    this.statusHandlers.add(onStatusChange);
    return { close: () => this.statusHandlers.delete(onStatusChange) };
  };

  getExecutionConnection = (): ExecutionConnection => this;

  listAccounts = async (): Promise<ExecutionAccount[]> => {
    const response = await this.request({ type: 'accounts' });
    return response.accounts || [];
  };

  getAccountState = async (accountId: string): Promise<ExecutionAccountState> => {
    const response = await this.request({ type: 'accountState', accountId });
    if (!response.state) throw new Error('Rithmic gateway returned no account state');
    return response.state;
  };

  subscribeAccountState = (
    accountId: string,
    onUpdate: (state: ExecutionAccountState) => void
  ): MarketDataSubscription => {
    let handlers = this.accountHandlers.get(accountId);
    if (!handlers) {
      handlers = new Set();
      this.accountHandlers.set(accountId, handlers);
      this.socket.send(JSON.stringify({ type: 'accountSubscribe', accountId }));
    }
    handlers.add(onUpdate);

    return {
      close: () => {
        const currentHandlers = this.accountHandlers.get(accountId);
        currentHandlers?.delete(onUpdate);
        if (currentHandlers?.size === 0) {
          this.accountHandlers.delete(accountId);
          if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type: 'accountUnsubscribe', accountId }));
          }
        }
      }
    };
  };

  placeOrder = async (order: OrderRequest): Promise<OrderUpdate> => {
    const response = await this.request({ type: 'order', order });
    if (!response.update) throw new Error('Rithmic gateway returned no order update');
    return response.update;
  };

  cancelOrder = async (orderId: string): Promise<OrderUpdate> => {
    const response = await this.request({ type: 'cancelOrder', orderId });
    if (!response.update) throw new Error('Rithmic gateway returned no cancellation update');
    return response.update;
  };

  cancelAll = async (symbol?: string): Promise<void> => {
    await this.request({ type: 'cancelAll', symbol });
  };

  flatten = async (symbol?: string): Promise<void> => {
    await this.request({ type: 'flatten', symbol });
  };

  subscribeOrderUpdates = (onUpdate: (update: OrderUpdate) => void): MarketDataSubscription => {
    this.orderHandlers.add(onUpdate);
    return { close: () => this.orderHandlers.delete(onUpdate) };
  };

  subscribeFills = (onFill: (fill: ExecutionFill) => void): MarketDataSubscription => {
    this.fillHandlers.add(onFill);
    return { close: () => this.fillHandlers.delete(onFill) };
  };

  close = (): void => {
    this.candleFlushTimers.forEach(timer => clearTimeout(timer));
    this.candleFlushTimers.clear();
    this.pendingCandles.clear();
    this.pending.forEach(request => {
      clearTimeout(request.timeout);
      request.reject(new Error('Rithmic connection closed'));
    });
    this.pending.clear();
    this.accountHandlers.clear();
    this.orderHandlers.clear();
    this.fillHandlers.clear();
    this.statusHandlers.clear();
    this.socket.close();
  };

  private queueCandle(candle: Candle): void {
    const key = candle.symbol || 'default';
    this.pendingCandles.set(key, candle);
    if (this.candleFlushTimers.has(key)) return;

    // Rithmic emits one candle update per trade print. Coalesce bursts while
    // retaining the most recent OHLCV value for the minute.
    const timer = setTimeout(() => {
      this.candleFlushTimers.delete(key);
      const latest = this.pendingCandles.get(key);
      if (!latest) return;
      this.pendingCandles.delete(key);
      this.candleHandlers.forEach(handler => handler(latest));
    }, 50);
    this.candleFlushTimers.set(key, timer);
  }

  private request(message: Record<string, unknown>): Promise<GatewayMessage> {
    const requestId = createRequestId();
    const timeoutMs = message.type === 'history' ? 300000 : 60000;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('Rithmic gateway request timed out'));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ ...message, requestId }));
    });
  }
}

export const RithmicService: MarketDataSource = {
  id: RITHMIC_SOURCE_ID,
  name: RITHMIC_SOURCE_NAME,
  requiresCredentials: true,
  connect: async options => RithmicGatewayConnection.connect(
    getCredentials(options),
    getGatewayUrl(options),
    options?.signal
  )
};
