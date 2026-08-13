# Rithmic gateway

The browser cannot safely or directly implement Rithmic's binary R|Protocol. This small local process accepts a login from OpenBackTest, opens the Rithmic Ticker Plant connection, and forwards normalized one-minute candles to the browser.

## Run it

From the repository root:

```sh
python3 -m venv .venv-rithmic
source .venv-rithmic/bin/activate
python -m pip install -r gateway/requirements.txt
python gateway/rithmic_gateway.py
```

Then use **Connect with Rithmic credentials** in the app. The app uses the Phidias profile automatically: `Rithmic Paper Trading`, Chicago, and CME. It resolves the current ES front-month contract after login. The user only enters the Rithmic username and password.

The browser-to-local-gateway URL remains `ws://127.0.0.1:8765` and can be overridden with `VITE_RITHMIC_GATEWAY_URL` at build time.

The gateway also supports `RITHMIC_GATEWAY_HOST`, `RITHMIC_GATEWAY_PORT`, and `LOG_LEVEL` environment variables.

## Scope and security

- This implementation logs in to the Rithmic Ticker Plant and subscribes to last trades.
- It aggregates those trades into one-minute candles for the chart.
- It keeps credentials in memory only and does not persist them.
- It does not place, modify, or cancel orders. Order routing must use a separate execution adapter after paper-trading and account-selection behavior are validated.
- Rithmic market-data entitlements and direct R|Protocol/API authorization are still required. Phidias credentials that work in R|Trader Pro or Quantower may be restricted from custom API clients.

The Python dependency uses the public `pyrithmic` protocol-buffer client as a transport definition. It is not an official Rithmic SDK; verify the protocol version and deployment requirements with Rithmic before production use.
