import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, CircleOff, Loader, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { useBacktestStore } from '../store/useBacktestStore';
import { useExecutionStore } from '../store/useExecutionStore';
import { useMarketDataStore } from '../store/useMarketDataStore';
import { useChartStyleStore } from '../store/useChartStyleStore';
import type { OrderType } from '../services/execution';

function formatCurrency(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value);
}

function formatNumber(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value);
}

function StatCard({ label, value, valueClass = 'text-slate-200' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-dark-700/50 bg-dark-900/50 p-2.5">
      <div className="mb-1 text-[10px] font-bold uppercase text-slate-500">{label}</div>
      <div className={`font-mono text-sm font-bold ${valueClass}`}>{value}</div>
    </div>
  );
}

export function ActualAccountPanel() {
  const currentSymbol = useBacktestStore(state => state.symbol);
  const currentPrice = useBacktestStore(state => state.rawData[state.currentIndex]?.close);
  const marketConnection = useMarketDataStore(state => state.connectionRef);
  const isMarketConnected = useMarketDataStore(state => state.isConnected);
  const brokerConnection = useExecutionStore(state => state.connection);
  const {
    accounts,
    selectedAccountId,
    accountState,
    isLoading,
    isSubmitting,
    error,
    connect,
    selectAccount,
    placeOrder,
    cancelOrder,
    cancelAll,
    flatten,
    askForConfirmations,
    setAskForConfirmations,
    pendingConfirmation,
    requestConfirmation,
    clearConfirmation
  } = useExecutionStore();
  const { upColor, downColor } = useChartStyleStore();
  const [orderSize, setOrderSize] = useState(1);
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [limitPrice, setLimitPrice] = useState('');
  const [isAccountInfoExpanded, setIsAccountInfoExpanded] = useState(false);
  useEffect(() => {
    void connect();
    return () => useExecutionStore.getState().disconnect();
  }, [marketConnection, isMarketConnected, connect]);

  const submitMarketOrder = async (side: 'buy' | 'sell') => {
    if (!currentSymbol || !Number.isFinite(orderSize) || orderSize <= 0) return;
    const parsedLimitPrice = Number(limitPrice);
    if (orderType === 'limit' && (!Number.isFinite(parsedLimitPrice) || parsedLimitPrice <= 0)) return;
    const description = orderType === 'limit'
      ? `${side.toUpperCase()} LIMIT ${orderSize} ${currentSymbol} @ ${parsedLimitPrice}`
      : `${side.toUpperCase()} MARKET ${orderSize} ${currentSymbol}`;
    const order = {
      symbol: currentSymbol,
      side,
      quantity: orderSize,
      orderType,
      ...(orderType === 'limit' ? { limitPrice: parsedLimitPrice } : {})
    } as const;
    const sendOrder = async () => {
      await placeOrder(order);
    };
    if (askForConfirmations) {
      requestConfirmation({
        description: `Submit live ${description}?`,
        confirmLabel: 'Send live order',
        submit: sendOrder
      });
    } else {
      await sendOrder();
    }
  };

  const handleFlatten = async () => {
    if (!currentSymbol) return;
    const flattenPosition = async () => {
      await flatten(currentSymbol);
    };
    if (askForConfirmations) {
      requestConfirmation({
        description: `Flatten ${currentSymbol}? This sends a live broker order.`,
        confirmLabel: 'Flatten position',
        submit: flattenPosition
      });
    } else {
      await flattenPosition();
    }
  };

  const closeConfirmation = () => {
    clearConfirmation();
  };

  const confirmPendingAction = async () => {
    const action = pendingConfirmation;
    closeConfirmation();
    if (action) await action.submit();
  };

  const pnlClass = (value?: number) => value === undefined ? 'text-slate-400' : value >= 0 ? 'text-emerald-400' : 'text-red-400';
  const snapshot = accountState;
  const netPnL = snapshot
    ? (snapshot.realizedPnL ?? 0) + (snapshot.unrealizedPnL ?? 0) - (snapshot.commissions ?? 0)
    : undefined;
  const canTrade = Boolean(
    snapshot
    && selectedAccountId
    && currentSymbol
    && !isSubmitting
    && (orderType === 'market' || (Number.isFinite(Number(limitPrice)) && Number(limitPrice) > 0))
  );

  return (
    <div className="space-y-4 border-t border-dark-700/50 pt-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            <ShieldCheck size={12} className="text-amber-400" />
            Live Account
          </div>
          <div className="mt-1 text-xs text-slate-400">Broker-sourced data and live execution</div>
        </div>
        <button
          type="button"
          onClick={() => void connect()}
          disabled={isLoading || !brokerConnection}
          className="rounded-md border border-dark-700 bg-dark-900 p-1.5 text-slate-400 transition-colors hover:text-white disabled:opacity-40"
          title="Refresh account data"
        >
          {isLoading ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[10px] leading-4 text-amber-200/80">
        Live mode sends orders to the selected broker account. Review the symbol and quantity before submitting.
      </div>

      

      {!brokerConnection && (
        <div className="rounded-lg border border-dark-700 bg-dark-900/50 p-3 text-xs leading-5 text-slate-400">
          Connect Rithmic from the Data Source section to load trading accounts.
        </div>
      )}

      {accounts.length > 0 && (
        <div>
          <label htmlFor="actual-account" className="mb-1 block text-[10px] font-bold uppercase text-slate-500">Trading Account</label>
          <select
            id="actual-account"
            value={selectedAccountId || ''}
            onChange={event => void selectAccount(event.target.value)}
            className="w-full rounded-md border border-dark-700 bg-dark-900 px-2 py-1.5 text-xs text-slate-200 focus:border-primary-500 focus:outline-none"
          >
            {accounts.map(account => (
              <option key={account.id} value={account.id}>{account.displayName || account.id}</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs leading-5 text-red-300" role="alert">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {snapshot && (
        <>
          <div>
            <button
              type="button"
              onClick={() => setIsAccountInfoExpanded(expanded => !expanded)}
              aria-expanded={isAccountInfoExpanded}
              aria-controls="live-account-information"
              className="mb-1 flex w-full items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-slate-300"
            >
              <span className="flex items-center gap-1.5">
                <Wallet size={12} />
                Account Information
              </span>
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${isAccountInfoExpanded ? '' : '-rotate-90'}`}
              />
            </button>

            {isAccountInfoExpanded && (
              <div id="live-account-information" className="grid grid-cols-2 gap-3 pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <StatCard label="Equity" value={formatCurrency(snapshot.equity)} />
                <StatCard label="Balance" value={formatCurrency(snapshot.balance)} />
                <StatCard label="Open P&L" value={formatCurrency(snapshot.unrealizedPnL)} valueClass={pnlClass(snapshot.unrealizedPnL)} />
                <StatCard label="Realized P&L" value={formatCurrency(snapshot.realizedPnL)} valueClass={pnlClass(snapshot.realizedPnL)} />
                <StatCard label="Net P&L" value={formatCurrency(netPnL)} valueClass={pnlClass(netPnL)} />
                {/* <StatCard label="Commissions" value={formatCurrency(snapshot.commissions)} /> */}
                <StatCard label="Daily P&L" value={formatCurrency(snapshot.statistics.dailyPnL)} valueClass={pnlClass(snapshot.statistics.dailyPnL)} />
                <StatCard label="Open Positions" value={formatNumber(snapshot.statistics.openPositions)} />
                <StatCard label="Working Orders" value={formatNumber(snapshot.statistics.workingOrders)} />
                {/* <StatCard label="Updated" value={new Date(snapshot.updatedAt * 1000).toLocaleTimeString()} /> */}
              </div>
            )}
          </div>

          <div>
            {/* <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <BarChart3 size={12} />
              Live Account Statistics
            </div> */}
            <div className="grid grid-cols-2 gap-2">
              
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <Wallet size={12} />
              Positions
            </div>
            {snapshot.positions.length === 0 ? (
              <div className="rounded-lg border border-dark-700 bg-dark-900/50 p-3 text-xs text-slate-500">No open positions.</div>
            ) : (
              <div className="space-y-2">
                {snapshot.positions.map(position => (
                  <div key={position.symbol} className="rounded-lg border border-dark-700/60 bg-dark-900/50 p-2.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-200">{position.symbol}</span>
                      <span className={position.side === 'long' ? 'text-emerald-400' : position.side === 'short' ? 'text-red-400' : 'text-slate-400'}>
                        {position.side.toUpperCase()} {formatNumber(position.quantity)}
                      </span>
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                      <span>Avg {position.averagePrice === undefined ? '—' : position.averagePrice.toFixed(4)}</span>
                      <span className={pnlClass(position.unrealizedPnL)}>Open P&L {formatCurrency(position.unrealizedPnL)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <span>Working Orders</span>
              {snapshot.orders.some(order => order.status === 'working' || order.status === 'partially-filled') && (
                <button
                  type="button"
                  onClick={() => void cancelAll(currentSymbol)}
                  disabled={isSubmitting}
                  className="rounded border border-red-500/30 px-2 py-1 text-[9px] text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                >
                  Cancel all
                </button>
              )}
            </div>
            {snapshot.orders.filter(order => order.status === 'working' || order.status === 'partially-filled').length === 0 ? (
              <div className="rounded-lg border border-dark-700 bg-dark-900/50 p-3 text-xs text-slate-500">No working orders.</div>
            ) : (
              <div className="space-y-2">
                {snapshot.orders
                  .filter(order => order.status === 'working' || order.status === 'partially-filled')
                  .map(order => (
                    <div key={order.orderId} className="flex items-center justify-between gap-2 rounded-lg border border-dark-700/60 bg-dark-900/50 p-2.5 text-xs">
                      <div>
                        <div className="font-medium text-slate-200">{order.side.toUpperCase()} {formatNumber(order.quantity)} {order.symbol}</div>
                        <div className="mt-1 text-[10px] text-slate-500">{order.orderId} · {order.status}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void cancelOrder(order.orderId)}
                        disabled={isSubmitting}
                        className="rounded border border-slate-600 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="actual-order-size" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Order Size {currentSymbol ? `· ${currentSymbol}` : ''}
            </label>
            <select
              id="actual-order-type"
              value={orderType}
              onChange={event => setOrderType(event.target.value as OrderType)}
              disabled={isSubmitting}
              className="mb-2 w-full rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none disabled:opacity-50"
            >
              <option value="market">Market order</option>
              <option value="limit">Limit order</option>
            </select>
            <input
              id="actual-order-size"
              type="number"
              min="1"
              step="1"
              value={orderSize}
              onChange={event => setOrderSize(Math.max(1, Number(event.target.value) || 1))}
              className="mb-2 w-full rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none disabled:opacity-50"
              disabled={isSubmitting}
            />
            {orderType === 'limit' && (
              <input
                id="actual-limit-price"
                type="number"
                min="0"
                step="any"
                value={limitPrice}
                onChange={event => setLimitPrice(event.target.value)}
                placeholder={currentPrice ? `Current ${formatNumber(currentPrice)}` : 'Limit price'}
                className="mb-2 w-full rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none disabled:opacity-50"
                disabled={isSubmitting}
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void submitMarketOrder('buy')}
                disabled={!canTrade}
                style={{ backgroundColor: upColor }}
                className="rounded-lg py-2.5 text-xs font-bold text-white transition-all hover:brightness-110 disabled:opacity-50"
              >
                {orderType === 'limit' ? 'Buy Limit' : 'Buy Market'}
              </button>
              <button
                type="button"
                onClick={() => void submitMarketOrder('sell')}
                disabled={!canTrade}
                style={{ backgroundColor: downColor }}
                className="rounded-lg py-2.5 text-xs font-bold text-white transition-all hover:brightness-110 disabled:opacity-50"
              >
                {orderType === 'limit' ? 'Sell Limit' : 'Sell Market'}
              </button>
              <button
                type="button"
                onClick={() => void handleFlatten()}
                disabled={!canTrade}
                className="col-span-2 flex items-center justify-center gap-2 rounded-lg bg-slate-700 py-2.5 text-xs font-bold text-white transition-all hover:bg-slate-600 disabled:opacity-50"
              >
                <CircleOff size={14} />
                Flatten {currentSymbol || 'Position'}
              </button>
            </div>
          </div>
        </>
      )}
      <label className="flex items-center gap-2 text-xs text-slate-400">
        <input
          type="checkbox"
          checked={askForConfirmations}
          onChange={event => setAskForConfirmations(event.target.checked)}
          className="h-3.5 w-3.5 accent-primary-500"
        />
        Ask for confirmations
      </label>

      {pendingConfirmation && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-transparent p-4"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) closeConfirmation();
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-dark-700 bg-dark-800 p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="live-trade-confirmation-title"
          >
            <div className="mb-2 text-sm font-bold text-white" id="live-trade-confirmation-title">
              Confirm live trade
            </div>
            <p className="text-sm leading-6 text-slate-300">{pendingConfirmation.description}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeConfirmation}
                className="rounded-lg border border-dark-600 px-4 py-2 text-xs font-bold text-slate-300 transition-colors hover:bg-dark-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmPendingAction()}
                className="rounded-lg px-4 py-2 text-xs font-bold text-white transition-all hover:brightness-110"
                style={{ backgroundColor: upColor }}
              >
                {pendingConfirmation.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
