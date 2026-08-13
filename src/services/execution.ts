import type { MarketSymbol } from '../types';

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop' | 'stop-limit';
export type OrderStatus = 'pending' | 'working' | 'partially-filled' | 'filled' | 'cancelled' | 'rejected';

/**
 * Future broker order contract. This is intentionally separate from
 * MarketDataConnection and is not wired to the simulation buttons yet.
 */
export interface OrderRequest {
  clientOrderId?: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  orderType: OrderType;
  limitPrice?: number;
  stopPrice?: number;
  reduceOnly?: boolean;
  takeProfitPrice?: number;
  stopLossPrice?: number;
}

export interface OrderUpdate extends OrderRequest {
  orderId: string;
  status: OrderStatus;
  filledQuantity: number;
  averageFillPrice?: number;
  rejectReason?: string;
}

export interface ExecutionFill {
  orderId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  time: number;
  fee?: number;
}

export interface ExecutionPosition {
  symbol: string;
  side: 'long' | 'short' | 'flat';
  quantity: number;
  averagePrice?: number;
  unrealizedPnL?: number;
}

export interface ExecutionConnection {
  readonly sourceId: string;
  readonly sourceName: string;

  placeOrder: (order: OrderRequest) => Promise<OrderUpdate>;
  cancelOrder: (orderId: string) => Promise<OrderUpdate>;
  cancelAll: (symbol?: string) => Promise<void>;
  flatten: (symbol?: string) => Promise<void>;
  listSymbols: () => Promise<MarketSymbol[]>;
  getPositions: () => Promise<ExecutionPosition[]>;
  subscribeOrderUpdates: (onUpdate: (update: OrderUpdate) => void) => { close: () => void };
  subscribeFills: (onFill: (fill: ExecutionFill) => void) => { close: () => void };
  close: () => void;
}
