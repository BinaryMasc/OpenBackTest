# OpenBackTest Rithmic gateway

This is a local WebSocket gateway for OpenBackTest's Rithmic data and live
account modes. It uses the native RAPI+ .NET assembly, matching the runtime
path used by Quantower's Rithmic connector.

The default profile is **Rithmic Paper Trading / Chicago Area**. It contains
public connection metadata only; never put a username, password, certificate,
or private key in this repository.

## Requirements

- .NET 8 SDK.
- The gateway includes the validated RAPI+ runtime at
  `gateway/runtime/rapiplus.dll` and its client-auth certificate at
  `gateway/certificates/rithmic_ssl_cert_auth_params`. Both are copied to the
  build and publish output automatically.
- Set `RITHMIC_RAPI_DLL` or `RITHMIC_CA_FILE` only when overriding those
  bundled files with another authorized runtime or certificate.
- Rithmic paper-trading credentials with market-data, account, and order
  permissions.

Example (bash):

```sh
# Optional overrides for the bundled gateway/runtime and certificate files.
# export RITHMIC_RAPI_DLL=/path/to/rapiplus.dll
# export RITHMIC_CA_FILE=/path/to/rithmic_ssl_cert_auth_params
dotnet run --project gateway/RithmicGateway.csproj
```

Then run the Vite app with `npm run dev` and select **Connect with Rithmic
credentials**. The browser connects to `ws://127.0.0.1:8765` by default. Set
`VITE_RITHMIC_GATEWAY_URL` if the gateway uses another local URL.

## Data behavior

- Symbols default to `CME.ESU6`, `CME.NQU6` (Nasdaq), and `COMEX.GCQ6`
  (Gold). Use exchange-qualified values in `RITHMIC_SYMBOLS` (for example,
  `CME.ESU6,CME.NQU6,COMEX.GCQ6`) when changing the list.
- History is requested as RAPI+ minute-bar replay and stored as broker-provided
  OHLCV candles. Requests are replayed in bounded chunks so the chart is not
  limited to the broker's single-day window. The default is 10,000 minutes;
  increase it with `RITHMIC_MAX_HISTORY_MINUTES` when appropriate. The
  browser's existing aggregation handles higher chart timeframes.
- Live RAPI+ trade prints update the current one-minute candle.
- The gateway exposes account discovery, PnL/position snapshots and streams,
  market- and limit-order submission, order cancellation, cancel-all, and position
  flattening to Live mode. Before sending an order it resolves the enabled
  Rithmic trade route and waits briefly for the broker's line update, so
  working, filled, cancelled, and rejected states stay correlated with the
  browser order. Set `RITHMIC_TRADE_ROUTE` to override route discovery.
  It intentionally keeps the browser protocol provider-neutral; Rithmic-specific
  translation stays here.
- Live mode is live execution from the broker's perspective. Start with a
  paper account, confirm the selected symbol and quantity, and verify the
  installed RAPI+ runtime's permissions and conformance requirements before
  using production credentials.
- A single browser session is accepted at a time. The gateway keeps credentials
  in memory for that session and clears its callback handler on disconnect.

The profile can be replaced with `RITHMIC_RAPI_PROFILE`, and individual
connection fields can be overridden with the `RITHMIC_*` environment variables
used in `Program.cs`.
