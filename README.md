# <img src="./public/icon.png" width="48" align="center" /> OpenBackTest

[Open in browser](https://binarymasc.github.io/OpenBackTest/)

A manual backtest open-source tool Client-Side Only.

Check the [Codebase Guide](CODEBASE.md) for a detailed file-by-file documentation.

**Playback**
![Playback](/public/playback.png)

**Trade Panel**
![Trade Panel](/public/simulation.png)

**Binance Live Data Feed**
![Binance Data](/public/binance_data-feed.png)

**Simulation Statistics**
![Simulation Statistics](/public/simulation_metrics.png)

### Features
- Import historical data and visualize it on a chart.
- Simulate market data realtime.
- Backtest with your trading strategy.
- Backtest analysis tools, chart tools and indicators.
- Live broker data (Rithmic, Binance)
- Live order execution.

### Data import format

```
datetime,open,high,low,close,volume,symbol
YYYY-MM-DD HH:mm:ss,open,high,low,close,volume,symbol
```

### Execute locally
```sh
npm install
npm run build
npm run dev
```

### Rithmic market data and live account

OpenBackTest includes a Rithmic provider for the Phidias paper-trading profile
(Rithmic Paper Trading / Chicago Area). The Live Trade mode shows broker
account statistics and can route market orders, cancel orders, and flatten a
position through the local .NET RAPI+ gateway. See
[`gateway/README.md`](gateway/README.md) for setup and live-mode precautions.

Start the gateway, start OpenBackTest, then choose **Connect with Rithmic
credentials** in the data controls. Credentials are entered in the browser and
forwarded only to the local gateway; they are not part of the repository.

### Testing
The project uses `vitest` and `@testing-library/react` for unit testing. All tests are located in the `tests/` directory.

```sh
npm run test       # Run test suite
npm run coverage   # Run tests with coverage report
```

### To-Do
- [x] Session: Import/export current session and trades to continue later.
- [x] Backtest Data: Show more statistics, calendar view, etc...
- [ ] Chart: CTRL+C and CTRL+V to copy and paste overlays.
- [x] Chart: Ability to change the color of the candles.
- [x] Data: Real-time connection to live market (Crypto).
- [x] Data: Provider-neutral market-data connection abstraction.
- [x] Testing: Establish unit testing foundation for stores, hooks, and components.
- [ ] Indicators: (Engine) Ability to load dynamic scripts with indicators or strategies in execution-time.
- [x] Data: Rithmic market-data adapter through a local RAPI+ gateway.
- [x] Trading: Provider-neutral live-account contract with Rithmic adapter.
- [ ] Trading: Additional execution adapters (for example, Binance).
