export interface ExecutionAccount {
  id: string;
  fcmId?: string;
  ibId?: string;
  displayName?: string;
}

export interface ExecutionAccountStatistics {
  dailyPnL?: number;
  realizedPnL?: number;
  unrealizedPnL?: number;
  openPositions: number;
  workingOrders: number;
  updatedAt: number;
}

export interface ExecutionAccountState {
  account: ExecutionAccount;
  balance?: number;
  equity?: number;
  buyingPower?: number;
  marginUsed?: number;
  realizedPnL?: number;
  unrealizedPnL?: number;
  commissions?: number;
  positions: ExecutionPosition[];
  orders: OrderUpdate[];
  statistics: ExecutionAccountStatistics;
  updatedAt: number;
}

export interface ExecutionConfirmation {
  description: string;
  confirmLabel: string;
  submit: () => Promise<void>;
}

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop' | 'stop-limit';
export type OrderStatus = 'pending' | 'working' | 'partially-filled' | 'filled' | 'cancelled' | 'rejected';

/** Provider-neutral order contract used by live-account mode. */
export interface OrderRequest {
  /** Selected account context, supplied by the account store when needed. */
  accountId?: string;
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
  realizedPnL?: number;
}

export interface ExecutionConnection {
  readonly sourceId: string;
  readonly sourceName: string;

  placeOrder: (order: OrderRequest) => Promise<OrderUpdate>;
  cancelOrder: (orderId: string) => Promise<OrderUpdate>;
  cancelAll: (symbol?: string) => Promise<void>;
  flatten: (symbol?: string) => Promise<void>;
  listAccounts: () => Promise<ExecutionAccount[]>;
  getAccountState: (accountId: string) => Promise<ExecutionAccountState>;
  subscribeAccountState: (
    accountId: string,
    onUpdate: (state: ExecutionAccountState) => void
  ) => { close: () => void };
  subscribeOrderUpdates: (onUpdate: (update: OrderUpdate) => void) => { close: () => void };
  subscribeFills: (onFill: (fill: ExecutionFill) => void) => { close: () => void };
  close: () => void;
}
