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
- Backtest analysis tools to improve your trading skills.
- Draw on the charts and add indicators to analyze the data.

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
- [ ] Indicators: (Engine) Ability to load dynamic scripts with indicators or strategies.
- [ ] Data: Rithmic market-data adapter (requires Rithmic API access/dev kit).
- [ ] Trading: Broker execution adapters and live order routing.
