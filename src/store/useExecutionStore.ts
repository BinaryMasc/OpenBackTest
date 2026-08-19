import { create } from 'zustand';
import type {
  ExecutionAccount,
  ExecutionAccountState,
  ExecutionConnection,
  ExecutionConfirmation,
  OrderRequest,
  OrderUpdate
} from '../services/execution';
import { useMarketDataStore } from './useMarketDataStore';

interface ExecutionStoreState {
  connection: ExecutionConnection | null;
  accounts: ExecutionAccount[];
  selectedAccountId: string | null;
  accountState: ExecutionAccountState | null;
  isLoading: boolean;
  isSubmitting: boolean;
  askForConfirmations: boolean;
  pendingConfirmation: ExecutionConfirmation | null;
  error: string | null;

  connect: () => Promise<void>;
  selectAccount: (accountId: string) => Promise<void>;
  placeOrder: (order: OrderRequest) => Promise<OrderUpdate | null>;
  cancelOrder: (orderId: string) => Promise<OrderUpdate | null>;
  cancelAll: (symbol?: string) => Promise<void>;
  flatten: (symbol?: string) => Promise<void>;
  requestConfirmation: (confirmation: ExecutionConfirmation) => void;
  clearConfirmation: () => void;
  setAskForConfirmations: (ask: boolean) => void;
  disconnect: () => void;
}

let requestSequence = 0;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Account connection failed';
}

function closeSubscription(subscription: { close: () => void } | null) {
  subscription?.close();
}

let accountSubscription: { close: () => void } | null = null;
let orderSubscription: { close: () => void } | null = null;
let fillSubscription: { close: () => void } | null = null;

function clearSubscriptions() {
  closeSubscription(accountSubscription);
  closeSubscription(orderSubscription);
  closeSubscription(fillSubscription);
  accountSubscription = null;
  orderSubscription = null;
  fillSubscription = null;
}

export const useExecutionStore = create<ExecutionStoreState>((set, get) => {
  const loadSelectedAccount = async (connection: ExecutionConnection, accountId: string, sequence: number) => {
    const accountState = await connection.getAccountState(accountId);
    if (sequence !== requestSequence || get().connection !== connection) return;

    clearSubscriptions();
    accountSubscription = connection.subscribeAccountState(accountId, state => {
      if (get().connection === connection && get().selectedAccountId === accountId) {
        set({ accountState: state, error: null });
      }
    });
    orderSubscription = connection.subscribeOrderUpdates(update => {
      if (get().connection !== connection) return;
      const current = get().accountState;
      if (!current || current.account.id !== accountId) return;
      if (update.accountId && update.accountId !== accountId) return;
      set({
        accountState: {
          ...current,
          orders: [
            ...current.orders.filter(order =>
              order.orderId !== update.orderId
              && (!update.clientOrderId || order.clientOrderId !== update.clientOrderId)
            ),
            update
          ]
        }
      });
    });
    fillSubscription = connection.subscribeFills(() => {
      if (get().connection !== connection || get().selectedAccountId !== accountId) return;
      void get().selectAccount(accountId);
    });
    set({ accountState, isLoading: false, error: null });
  };

  return {
    connection: null,
    accounts: [],
    selectedAccountId: null,
    accountState: null,
    isLoading: false,
    isSubmitting: false,
    askForConfirmations: true,
    pendingConfirmation: null,
    error: null,

    connect: async () => {
      const marketConnection = useMarketDataStore.getState().connectionRef;
      const connection = marketConnection?.getExecutionConnection?.();
      if (!connection) {
        set({ error: 'Connect a broker that supports account trading first.' });
        return;
      }

      const sequence = ++requestSequence;
      clearSubscriptions();
      set({ connection, isLoading: true, error: null, accountState: null });
      try {
        const accounts = await connection.listAccounts();
        if (sequence !== requestSequence || get().connection !== connection) return;
        set({ accounts });
        const selectedAccountId = accounts.some(account => account.id === get().selectedAccountId)
          ? get().selectedAccountId
          : accounts[0]?.id || null;
        if (!selectedAccountId) {
          set({ isLoading: false, error: 'The broker returned no trading accounts.' });
          return;
        }
        set({ selectedAccountId });
        await loadSelectedAccount(connection, selectedAccountId, sequence);
      } catch (error) {
        if (sequence === requestSequence) set({ isLoading: false, error: getErrorMessage(error) });
      }
    },

    selectAccount: async (accountId: string) => {
      const connection = get().connection;
      if (!connection) return;
      const account = get().accounts.find(item => item.id === accountId);
      if (!account) return;

      const sequence = ++requestSequence;
      clearSubscriptions();
      set({ selectedAccountId: accountId, accountState: null, isLoading: true, error: null });
      try {
        await loadSelectedAccount(connection, accountId, sequence);
      } catch (error) {
        if (sequence === requestSequence) set({ isLoading: false, error: getErrorMessage(error) });
      }
    },

    placeOrder: async (order: OrderRequest) => {
      const connection = get().connection;
      const accountId = get().selectedAccountId;
      if (!connection || !accountId) {
        set({ error: 'Select a connected trading account first.' });
        return null;
      }

      set({ isSubmitting: true, error: null });
      try {
        const update = await connection.placeOrder({
          ...order,
          accountId,
          clientOrderId: order.clientOrderId || `openbacktest-${Date.now()}`
        });
        const normalizedUpdate: OrderUpdate = {
          ...order,
          ...update,
          accountId: update.accountId || accountId,
          limitPrice: update.limitPrice ?? order.limitPrice,
          stopPrice: update.stopPrice ?? order.stopPrice,
        };
        if (get().connection === connection && get().selectedAccountId === accountId) {
          const current = get().accountState;
          if (current) {
            set({
              accountState: {
                ...current,
                orders: [
                  ...current.orders.filter(order =>
                    order.orderId !== normalizedUpdate.orderId
                    && (!normalizedUpdate.clientOrderId || order.clientOrderId !== normalizedUpdate.clientOrderId)
                  ),
                  normalizedUpdate
                ]
              }
            });
          }
        }
        return normalizedUpdate;
      } catch (error) {
        set({ error: getErrorMessage(error) });
        return null;
      } finally {
        set({ isSubmitting: false });
      }
    },

    cancelOrder: async (orderId: string) => {
      const connection = get().connection;
      if (!connection) return null;
      set({ isSubmitting: true, error: null });
      try {
        const update = await connection.cancelOrder(orderId);
        const accountId = get().selectedAccountId;
        const current = get().accountState;
        if (accountId && current && update.accountId && update.accountId !== accountId) return update;
        if (current) {
          set({
            accountState: {
              ...current,
              orders: [
                ...current.orders.filter(order => order.orderId !== update.orderId),
                update,
              ],
            },
          });
        }
        return update;
      } catch (error) {
        set({ error: getErrorMessage(error) });
        return null;
      } finally {
        set({ isSubmitting: false });
      }
    },

    cancelAll: async (symbol?: string) => {
      const connection = get().connection;
      if (!connection) return;
      set({ isSubmitting: true, error: null });
      try {
        await connection.cancelAll(symbol);
      } catch (error) {
        set({ error: getErrorMessage(error) });
      } finally {
        set({ isSubmitting: false });
      }
    },

    flatten: async (symbol?: string) => {
      const connection = get().connection;
      const accountId = get().selectedAccountId;
      if (!connection || !accountId) return;
      set({ isSubmitting: true, error: null });
      try {
        await connection.flatten(symbol);
        // Flatten is asynchronous at the broker. Refresh until the account
        // snapshot no longer reports a position or working order for symbol,
        // so stale entry/exit lines do not look like an opposite trade.
        for (let attempt = 0; attempt < 6; attempt += 1) {
          await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 150 : 250));
          const state = await connection.getAccountState(accountId);
          if (get().connection !== connection || get().selectedAccountId !== accountId) return;
          set({ accountState: state });
          if (!symbol) break;
          const normalizedSymbol = symbol.toUpperCase();
          const sameSymbol = (value: string) => {
            const normalized = value.toUpperCase();
            return normalized === normalizedSymbol || normalized.split('.')[0] === normalizedSymbol.split('.')[0];
          };
          const hasPosition = state.positions.some(position => sameSymbol(position.symbol) && position.quantity > 0);
          const hasWorkingOrder = state.orders.some(order =>
            sameSymbol(order.symbol) && (order.status === 'pending' || order.status === 'working' || order.status === 'partially-filled')
          );
          if (!hasPosition && !hasWorkingOrder) break;
        }
      } catch (error) {
        set({ error: getErrorMessage(error) });
      } finally {
        set({ isSubmitting: false });
      }
    },

    requestConfirmation: (confirmation: ExecutionConfirmation) => set({ pendingConfirmation: confirmation }),
    clearConfirmation: () => set({ pendingConfirmation: null }),
    setAskForConfirmations: (ask: boolean) => set({ askForConfirmations: ask }),

    disconnect: () => {
      requestSequence += 1;
      clearSubscriptions();
      set({ connection: null, accounts: [], selectedAccountId: null, accountState: null, isLoading: false, isSubmitting: false, pendingConfirmation: null, error: null });
    }
  };
});
