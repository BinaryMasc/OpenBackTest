# OpenBackTest Rithmic gateway

This is a local, read-only WebSocket gateway for OpenBackTest's Rithmic data
provider. It uses the native RAPI+ .NET assembly, matching the runtime path
used by Quantower's Rithmic connector.

The default profile is **Rithmic Paper Trading / Chicago Area**. It contains
public connection metadata only; never put a username, password, certificate,
or private key in this repository.

## Requirements

- .NET 8 SDK.
- The RAPI+ runtime supplied by Rithmic or an authorized platform installation.
  Set `RITHMIC_RAPI_DLL` to the full path of `rapiplus.dll`.
- The RAPI+ client-auth certificate file when required by the installed runtime.
  Set `RITHMIC_CA_FILE` to that file's full path.
- Rithmic paper-trading credentials with market-data permissions.

Example (bash):

```sh
export RITHMIC_RAPI_DLL=/path/to/rapiplus.dll
export RITHMIC_CA_FILE=/path/to/rithmic_ssl_cert_auth_params
dotnet run --project gateway/RithmicGateway.csproj
```

Then run the Vite app with `npm run dev` and select **Connect with Rithmic
credentials**. The browser connects to `ws://127.0.0.1:8765` by default. Set
`VITE_RITHMIC_GATEWAY_URL` if the gateway uses another local URL.

## Data behavior

- Symbols default to `CME.ESU6`, `CME.NQU6` (Nasdaq), and `COMEX.GCQ6`
  (Gold). Use exchange-qualified values in `RITHMIC_SYMBOLS` (for example,
  `CME.ESU6,CME.NQU6,COMEX.GCQ6`) when changing the list.
- History is requested as RAPI+ trade replay and aggregated into one-minute
  candles. The browser's existing aggregation handles higher chart timeframes.
- Live RAPI+ trade prints update the current one-minute candle.
- Only repository/market-data login, reference data, trade replay, subscribe,
  unsubscribe, and logout are implemented. There are no order or account
  mutation calls.
- A single browser session is accepted at a time. The gateway keeps credentials
  in memory for that session and clears its callback handler on disconnect.

The profile can be replaced with `RITHMIC_RAPI_PROFILE`, and individual
connection fields can be overridden with the `RITHMIC_*` environment variables
used in `Program.cs`.
