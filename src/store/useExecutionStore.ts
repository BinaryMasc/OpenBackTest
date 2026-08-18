import { create } from 'zustand';
import type {
  ExecutionAccount,
  ExecutionAccountState,
  ExecutionConnection,
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
  error: string | null;

  connect: () => Promise<void>;
  selectAccount: (accountId: string) => Promise<void>;
  placeOrder: (order: OrderRequest) => Promise<OrderUpdate | null>;
  cancelOrder: (orderId: string) => Promise<void>;
  cancelAll: (symbol?: string) => Promise<void>;
  flatten: (symbol?: string) => Promise<void>;
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
        if (get().connection === connection && get().selectedAccountId === accountId) {
          const current = get().accountState;
          if (current) {
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
          }
        }
        return update;
      } catch (error) {
        set({ error: getErrorMessage(error) });
        return null;
      } finally {
        set({ isSubmitting: false });
      }
    },

    cancelOrder: async (orderId: string) => {
      const connection = get().connection;
      if (!connection) return;
      set({ isSubmitting: true, error: null });
      try {
        await connection.cancelOrder(orderId);
      } catch (error) {
        set({ error: getErrorMessage(error) });
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
      if (!connection) return;
      set({ isSubmitting: true, error: null });
      try {
        await connection.flatten(symbol);
      } catch (error) {
        set({ error: getErrorMessage(error) });
      } finally {
        set({ isSubmitting: false });
      }
    },

    disconnect: () => {
      requestSequence += 1;
      clearSubscriptions();
      set({ connection: null, accounts: [], selectedAccountId: null, accountState: null, isLoading: false, isSubmitting: false, error: null });
    }
  };
});
