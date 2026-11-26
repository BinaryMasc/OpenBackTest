# OpenBackTest contributor guide

These instructions apply throughout the repository. OpenBackTest is a React, TypeScript, and Vite app for manual backtesting. CSV playback and simulated trading run in the browser. Binance supplies market data directly. Rithmic market data and broker execution use a local .NET 8 WebSocket gateway.

## Run and verify changes

Run these commands from the repository root. On a fresh checkout, use `npm ci` to install the versions in `package-lock.json`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite app and open the printed URL under `/OpenBackTest/`. |
| `npm test -- --run tests/utils/series.test.ts` | Run one test file once. Substitute the file covering your change. |
| `npm test -- --run` | Run the full Vitest suite once. Use `npm test` for local watch mode. |
| `npm run coverage` | Run the suite with V8 coverage and generate an HTML report in `coverage/`. |
| `npm run lint` | Check the project with ESLint. |
| `npm run build` | Type-check the frontend and generate the production bundle in `dist/`. |
| `dotnet build gateway/RithmicGateway.csproj` | Compile gateway changes using the .NET 8 SDK. |

Put unit and integration tests under the root `tests/` directory, mirroring the relevant area of `src/`. Add corresponding tests for new UI components and stores, then run coverage. Vitest uses jsdom and React Testing Library. Shared setup in `tests/setup.ts` handles DOM cleanup and supplies a ResizeObserver stub. Use `renderHook` for hook behavior and mock chart, browser, or provider calls at their boundaries with `vi.mock` or `vi.spyOn`.

## Playback and charts

- `src/App.tsx` mounts the playback timer once for all charts. `src/store/useBacktestStore.ts` owns the raw candles, playback cursor, speed, and chart configurations. Start in `src/components/controls/` for data-source and session controls, and in `src/components/PlaybackBar.tsx` for seeking and stepping.
- `Candle.time` is Unix time in seconds. KlineCharts timestamps are milliseconds. Keep that conversion in the chart data path. For replay, `src/utils/series.ts` caches aggregation by input array and timeframe. Treat cached bars as immutable and build the forming bar only through `currentIndex`. A partially played hour must never reveal a later minute's high, low, close, or volume.
- Connected Binance charts use native history for timeframes above one minute. The minute feed still supplies the backtest store's current price. Check both paths when changing chart history or timeframe selection. The relevant tests are `tests/utils/series.test.ts` and `tests/components/BinanceHistory.test.tsx`.
- `src/components/ChartGrid.tsx` lays out the charts. `src/components/TradingChart/index.tsx` selects each series, and `src/hooks/useChart.ts` manages the KlineCharts instance, incremental updates, and reloads. Keep chart lifecycle and overlay synchronization in the hooks.
- To add a custom indicator, implement it in `src/lib/chart/indicators/`, register it and its defaults in `src/lib/chart/customIndicators.ts`, and update the chart's indicator menu and properties editor as needed. Anchored VWAP and anchored Volume Profile use a two-point range overlay. Keep each range associated with its indicator instance when editing or restoring a chart.
- `src/store/useChartStateStore.ts` persists layouts, views, indicators, and trade arrows. Preserve the legacy chart-only indicator lookup when changing symbol-scoped keys. `src/store/useChartStyleStore.ts` owns appearance settings, including day separators.

## Simulated trades and saved sessions

- Change fill netting, position reversals, P&L, and exit-trigger math in `src/lib/trading/engine.ts`. Keep the engine independent of React and Zustand. `src/store/useTradeStore.ts` handles order validation and applies fills. Run the engine and store tests when changing this behavior. Update the snapshot for `tests/store/useTradeStore.golden.test.ts` only for an intentional change to the recorded trades or account results.
- `src/services/session.ts` defines the exported JSON fields. A session contains playback settings and the simulated account. Load the matching candle data before importing it. Preserve compatibility with existing session files when changing store fields.
- For third-party trade imports, use the session's `backtest` and `trade` objects and supply timestamps in seconds. `src/components/StatsModal.tsx` uses `finishedPositions` for win/loss metrics and `tradeHistory` for fees and the trade log. With trade history present, net profit is the final recorded balance minus `initialBalance`. With an empty history, it sums finished-position P&L.

## Market data and broker execution

- Implement provider adapters against `src/services/marketData.ts` and register them in `src/services/marketDataRegistry.ts`. Normalize symbols and candles at the adapter boundary. `src/store/useMarketDataStore.ts` owns connections, history requests, and subscriptions. On provider, symbol, or timeframe changes, close obsolete subscriptions and discard late responses so an old feed cannot overwrite the active chart.
- Broker-capable providers expose an optional execution connection defined in `src/services/execution.ts`. Route broker account snapshots, orders, fills, and cancellations through `src/store/useExecutionStore.ts`. Keep the simulated account independent. Preserve the distinction between flattening one symbol and flattening an account, which cancels all working orders and exits every open position in that account.
- For Rithmic protocol changes, check both `src/services/rithmic.ts` and `gateway/Program.cs`. Exercise the browser adapter and order flows with the mocked providers in `tests/services/` and `tests/store/useExecutionStore.test.ts`. Keep broker credentials out of source, fixtures, and session exports. The browser's remember-credentials option uses `src/services/rithmicCredentialStorage.ts`.
- To run Rithmic locally, start `dotnet run --project gateway/RithmicGateway.csproj` alongside Vite. The browser defaults to `ws://127.0.0.1:8765`. For the paper profile, bundled runtime, and configuration overrides, see the [gateway setup guide](gateway/README.md).
