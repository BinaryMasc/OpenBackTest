import type { Candle, MarketSymbol } from '../types';
import type {
  MarketDataConnection,
  MarketDataConnectionOptions,
  MarketDataSource,
  MarketDataSubscription
} from './marketData';

export const RITHMIC_SOURCE_ID = 'rithmic';
export const RITHMIC_SOURCE_NAME = 'Phidias Rithmic';

export interface RithmicCredentials {
  username: string;
  password: string;
}

interface GatewayMessage {
  type: string;
  requestId?: string;
  message?: string;
  symbols?: MarketSymbol[];
  candles?: Candle[];
  candle?: Candle;
}

type CandleHandler = (candle: Candle) => void;

function getGatewayUrl(options?: MarketDataConnectionOptions): string {
  const configuredUrl = options?.settings?.gatewayUrl;
  if (typeof configuredUrl === 'string' && configuredUrl.length > 0) return configuredUrl;
  return import.meta.env.VITE_RITHMIC_GATEWAY_URL || 'ws://127.0.0.1:8765';
}

function getCredentialValue(credentials: Record<string, string> | undefined, key: keyof RithmicCredentials): string {
  return credentials?.[key] || '';
}

function createRequestId(): string {
  return `rithmic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

class RithmicGatewayConnection implements MarketDataConnection {
  readonly sourceId = RITHMIC_SOURCE_ID;
  readonly sourceName = RITHMIC_SOURCE_NAME;

  private readonly socket: WebSocket;
  private readonly symbols: MarketSymbol[];
  private readonly candleHandlers = new Set<CandleHandler>();
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
        this.candleHandlers.forEach(handler => handler(message.candle!));
        return;
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
      this.pending.forEach(request => {
        clearTimeout(request.timeout);
        request.reject(new Error('Rithmic gateway disconnected'));
      });
      this.pending.clear();
    };
  }

  static connect(credentials: RithmicCredentials, gatewayUrl: string): Promise<RithmicGatewayConnection> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(gatewayUrl);
      let settled = false;
      const connectTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.close();
          reject(new Error(`Rithmic gateway did not respond at ${gatewayUrl}`));
        }
      }, 15000);

      socket.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(connectTimeout);
          reject(new Error(`Could not reach the Rithmic gateway at ${gatewayUrl}`));
        }
      };

      socket.onopen = () => {
        socket.send(JSON.stringify({
          type: 'connect',
          credentials
        }));
      };

      socket.onmessage = event => {
        const message = JSON.parse(String(event.data)) as GatewayMessage;
        if (message.type === 'connected') {
          settled = true;
          clearTimeout(connectTimeout);
          const connection = new RithmicGatewayConnection(socket, message.symbols || []);
          resolve(connection);
        } else if (message.type === 'error' && !settled) {
          settled = true;
          clearTimeout(connectTimeout);
          socket.close();
          reject(new Error(message.message || 'Rithmic login failed'));
        }
      };
    });
  }

  listSymbols = async (): Promise<MarketSymbol[]> => this.symbols;

  fetchHistoricalCandles = async (symbol: string, interval = '1m', limit = 1000): Promise<Candle[]> => {
    const response = await this.request({ type: 'history', symbol, interval, limit });
    return response.candles || [];
  };

  subscribeCandles = (symbol: string, interval: string, onCandle: CandleHandler): MarketDataSubscription => {
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

  close = (): void => {
    this.pending.forEach(request => {
      clearTimeout(request.timeout);
      request.reject(new Error('Rithmic connection closed'));
    });
    this.pending.clear();
    this.socket.close();
  };

  private request(message: Record<string, unknown>): Promise<GatewayMessage> {
    const requestId = createRequestId();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('Rithmic gateway request timed out'));
      }, 15000);

      this.pending.set(requestId, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ ...message, requestId }));
    });
  }
}

function parseCredentials(options?: MarketDataConnectionOptions): RithmicCredentials {
  const credentials = options?.credentials;
  const result: RithmicCredentials = {
    username: getCredentialValue(credentials, 'username'),
    password: getCredentialValue(credentials, 'password')
  };

  const required: Array<keyof RithmicCredentials> = ['username', 'password'];
  const missing = required.filter(key => !result[key]);
  if (missing.length > 0) {
    throw new Error(`Missing Rithmic connection fields: ${missing.join(', ')}`);
  }
  return result;
}

const RithmicService: MarketDataSource = {
  id: RITHMIC_SOURCE_ID,
  name: RITHMIC_SOURCE_NAME,
  requiresCredentials: true,
  connect: async options => {
    const credentials = parseCredentials(options);
    const connection = await RithmicGatewayConnection.connect(credentials, getGatewayUrl(options));
    return connection;
  }
};

export { RithmicService };
