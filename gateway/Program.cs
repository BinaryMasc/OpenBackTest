using System.Globalization;
using System.Collections;
using System.Net;
using System.Net.WebSockets;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using com.omnesys.rapi;

var rapiDllPath = Environment.GetEnvironmentVariable("RITHMIC_RAPI_DLL")
    ?? Path.Combine(AppContext.BaseDirectory, "rapiplus.dll");
rapiDllPath = Path.GetFullPath(rapiDllPath);
if (!File.Exists(rapiDllPath))
    throw new InvalidOperationException($"RAPI+ rapiplus.dll was not found at {rapiDllPath}. Set RITHMIC_RAPI_DLL to override the bundled runtime.");
_ = AssemblyLoadContext.Default.LoadFromAssemblyPath(rapiDllPath);

var jsonOptions = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
var sessionGate = new SemaphoreSlim(1, 1);
var host = Environment.GetEnvironmentVariable("RITHMIC_GATEWAY_HOST") ?? "127.0.0.1";
var port = int.TryParse(Environment.GetEnvironmentVariable("RITHMIC_GATEWAY_PORT"), out var configuredPort)
    ? configuredPort
    : 8765;

using var listener = new HttpListener();
listener.Prefixes.Add($"http://{host}:{port}/");
listener.Start();
Console.WriteLine($"OpenBackTest Rithmic RAPI+ gateway listening on http://{host}:{port}/");

while (true)
{
    var context = await listener.GetContextAsync();
    if (!context.Request.IsWebSocketRequest)
    {
        context.Response.StatusCode = 426;
        context.Response.Close();
        continue;
    }

    if (!await sessionGate.WaitAsync(0))
    {
        context.Response.StatusCode = 409;
        context.Response.Close();
        continue;
    }

    _ = ServeSessionAsync(context, sessionGate);
}

async Task ServeSessionAsync(HttpListenerContext context, SemaphoreSlim gate)
{
    try
    {
        var socketContext = await context.AcceptWebSocketAsync(null);
        await new RapiSession(socketContext.WebSocket, jsonOptions).RunAsync();
    }
    catch (Exception exception)
    {
        Console.Error.WriteLine($"gateway session ended: {exception.Message}");
    }
    finally
    {
        gate.Release();
    }
}

static class GatewayDefaults
{
    public const string ProfileName = "rithmic-paper-chicago.profile";
    public const string DmnSrvrAddr = "ritpz01004.01.rithmic.com:65000~ritpz04063.04.rithmic.com:65000";
    public const string DomainName = "rithmic_paper_prod_domain";
    public const string LicSrvrAddr = "ritpz04063.04.rithmic.com:56000~ritpz01004.01.rithmic.com:56000";
    public const string LocBrokAddr = "ritpz04063.04.rithmic.com:64100";
    public const string LoggerAddr = "ritpz04063.04.rithmic.com:45454~ritpz01004.01.rithmic.com:45454";
    public const string RepositoryPlant = "login_agent_repositoryc";
    public const string MdPlant = "login_agent_tp_paperc";
    public const string TsPlant = "login_agent_op_paperc";
    public const string PnlPlant = "login_agent_pnl_paperc";
    public const string IhPlant = "login_agent_history_paperc";
}

sealed record RithmicSymbolRequest(string Exchange, string Symbol);

sealed class RapiConfig
{
    public string DmnSrvrAddr { get; }
    public string DomainName { get; }
    public string LicSrvrAddr { get; }
    public string LocBrokAddr { get; }
    public string LoggerAddr { get; }
    public string RepositoryPlant { get; }
    public string MdPlant { get; }
    public string TsPlant { get; }
    public string PnlPlant { get; }
    public string IhPlant { get; }
    public string DefaultExchange { get; }
    public RithmicSymbolRequest[] Symbols { get; }
    public string? CertificatePath { get; }
    public string? TradeRoute { get; }
    public int MaxHistoryMinutes { get; }
    public int ReplayChunkMinutes { get; }

    public RapiConfig()
    {
        var values = ReadProfile(FindProfile());
        DmnSrvrAddr = Setting("RITHMIC_DMN_SRVR_ADDR", values, "DmnSrvrAddr", GatewayDefaults.DmnSrvrAddr);
        DomainName = Setting("RITHMIC_DOMAIN_NAME", values, "DomainName", GatewayDefaults.DomainName);
        LicSrvrAddr = Setting("RITHMIC_LIC_SRVR_ADDR", values, "LicSrvrAddr", GatewayDefaults.LicSrvrAddr);
        LocBrokAddr = Setting("RITHMIC_LOC_BROK_ADDR", values, "LocBrokAddr", GatewayDefaults.LocBrokAddr);
        LoggerAddr = Setting("RITHMIC_LOGGER_ADDR", values, "LoggerAddr", GatewayDefaults.LoggerAddr);
        RepositoryPlant = Setting("RITHMIC_REPOSITORY_PLANT", values, "RepositoryPlant", GatewayDefaults.RepositoryPlant);
        MdPlant = Setting("RITHMIC_MD_PLANT", values, "MdPlant", GatewayDefaults.MdPlant);
        TsPlant = Setting("RITHMIC_TS_PLANT", values, "TsPlant", GatewayDefaults.TsPlant);
        PnlPlant = Setting("RITHMIC_PNL_PLANT", values, "PnlPlant", GatewayDefaults.PnlPlant);
        IhPlant = Setting("RITHMIC_IH_PLANT", values, "IhPlant", GatewayDefaults.IhPlant);
        DefaultExchange = Environment.GetEnvironmentVariable("RITHMIC_EXCHANGE") ?? "CME";
        var configuredSymbols = Environment.GetEnvironmentVariable("RITHMIC_SYMBOLS");
        Symbols = ParseSymbols(
            string.IsNullOrWhiteSpace(configuredSymbols)
                ? "CME.ESU6,CME.MESU6,CME.NQU6,CME.MNQU6,COMEX.GCZ6,COMEX.MGCZ6"
                : configuredSymbols,
            DefaultExchange);
        CertificatePath = Environment.GetEnvironmentVariable("RITHMIC_CA_FILE")
            ?? Path.Combine(AppContext.BaseDirectory, "rithmic_ssl_cert_auth_params");
        TradeRoute = Environment.GetEnvironmentVariable("RITHMIC_TRADE_ROUTE");
        MaxHistoryMinutes = int.TryParse(Environment.GetEnvironmentVariable("RITHMIC_MAX_HISTORY_MINUTES"), out var minutes)
            ? Math.Clamp(minutes, 1, 10_000)
            : 10_000;
        ReplayChunkMinutes = int.TryParse(Environment.GetEnvironmentVariable("RITHMIC_REPLAY_CHUNK_MINUTES"), out var chunkMinutes)
            ? Math.Clamp(chunkMinutes, 1, 2_000)
            : 1_440;
    }

    private static string FindProfile()
    {
        var configured = Environment.GetEnvironmentVariable("RITHMIC_RAPI_PROFILE");
        if (!string.IsNullOrWhiteSpace(configured)) return configured;

        var candidates = new[]
        {
            Path.Combine(Directory.GetCurrentDirectory(), "gateway", GatewayDefaults.ProfileName),
            Path.Combine(Directory.GetCurrentDirectory(), GatewayDefaults.ProfileName),
            Path.Combine(AppContext.BaseDirectory, GatewayDefaults.ProfileName),
            Path.Combine(AppContext.BaseDirectory, "..", "..", "..", GatewayDefaults.ProfileName)
        };
        return candidates.FirstOrDefault(File.Exists) ?? string.Empty;
    }

    private static Dictionary<string, string> ReadProfile(string path)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path)) return result;

        foreach (var rawLine in File.ReadLines(path))
        {
            var line = rawLine.Trim();
            if (line.Length == 0 || line.StartsWith('#')) continue;
            if (line.StartsWith("* ", StringComparison.Ordinal)) line = line[2..].Trim();
            var separator = line.IndexOf('=');
            if (separator < 0) separator = line.IndexOf(':');
            if (separator <= 0) continue;
            result[line[..separator].Trim()] = line[(separator + 1)..].Trim();
        }
        return result;
    }

    private static string Setting(string environmentName, Dictionary<string, string> values, string key, string fallback)
        => Environment.GetEnvironmentVariable(environmentName)
            ?? (values.TryGetValue(key, out var value) ? value : fallback);

    private static RithmicSymbolRequest[] ParseSymbols(string configured, string defaultExchange)
        => configured
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(value =>
            {
                var separator = value.LastIndexOf('.');
                return separator > 0
                    ? new RithmicSymbolRequest(value[..separator].Trim(), value[(separator + 1)..].Trim())
                    : new RithmicSymbolRequest(defaultExchange, value);
            })
            .Where(value => !string.IsNullOrWhiteSpace(value.Exchange) && !string.IsNullOrWhiteSpace(value.Symbol))
            .ToArray();
}

static class CallbackRelay
{
    private static Action<string, object?>? handler;

    public static void Set(Action<string, object?> callback) => Volatile.Write(ref handler, callback);
    public static void Clear() => Volatile.Write(ref handler, null);
    public static void Dispatch(string eventName, object? info) => Volatile.Read(ref handler)?.Invoke(eventName, info);
}

sealed class GatewayCallbacks : RCallbacks
{
    public override void Alert(AlertInfo info) => CallbackRelay.Dispatch(nameof(Alert), info);
    public override void AccountList(AccountListInfo info) => CallbackRelay.Dispatch(nameof(AccountList), info);
    public override void ExchangeList(ExchangeListInfo info) => CallbackRelay.Dispatch(nameof(ExchangeList), info);
    public override void FillReport(OrderFillReport report) => CallbackRelay.Dispatch(nameof(FillReport), report);
    public override void LineUpdate(LineInfo info) => CallbackRelay.Dispatch(nameof(LineUpdate), info);
    public override void PnlUpdate(PnlInfo info) => CallbackRelay.Dispatch(nameof(PnlUpdate), info);
    public override void PnlReplay(PnlReplayInfo info) => CallbackRelay.Dispatch(nameof(PnlReplay), info);
    public override void RefData(RefDataInfo info) => CallbackRelay.Dispatch(nameof(RefData), info);
    public override void TradePrint(TradeInfo info) => CallbackRelay.Dispatch(nameof(TradePrint), info);
    public override void TradeReplay(TradeReplayInfo info) => CallbackRelay.Dispatch(nameof(TradeReplay), info);
    public override void TradeRouteList(TradeRouteListInfo info) => CallbackRelay.Dispatch(nameof(TradeRouteList), info);
}

sealed class CandleBuffer
{
    private readonly object gate = new();
    private readonly Dictionary<string, SortedDictionary<long, Candle>> candles = new(StringComparer.OrdinalIgnoreCase);
    private const int MaximumCandles = 10_000;

    public Candle Add(string symbol, string exchange, double price, long volume, long timestamp)
    {
        var minute = timestamp - (timestamp % 60);
        var key = $"{symbol}.{exchange}";
        lock (gate)
        {
            if (!candles.TryGetValue(key, out var series))
            {
                series = new SortedDictionary<long, Candle>();
                candles[key] = series;
            }
            if (!series.TryGetValue(minute, out var candle))
            {
                candle = new Candle { Time = minute, Open = price, High = price, Low = price, Close = price, Volume = 0, Symbol = key };
                series[minute] = candle;
            }
            candle.High = Math.Max(candle.High, price);
            candle.Low = Math.Min(candle.Low, price);
            candle.Close = price;
            candle.Volume += Math.Max(0, volume);
            while (series.Count > MaximumCandles) series.Remove(series.First().Key);
            return candle.Copy();
        }
    }

    public List<Candle> Get(string qualifiedSymbol, int limit)
    {
        lock (gate)
        {
            return candles.TryGetValue(qualifiedSymbol, out var series)
                ? series.Values
                .TakeLast(Math.Clamp(limit, 1, MaximumCandles))
                .Select(candle => candle.Copy())
                .ToList()
                : new List<Candle>();
        }
    }
}

sealed class Candle
{
    public long Time { get; set; }
    public double Open { get; set; }
    public double High { get; set; }
    public double Low { get; set; }
    public double Close { get; set; }
    public long Volume { get; set; }
    public string Symbol { get; set; } = string.Empty;

    public Candle Copy() => new() { Time = Time, Open = Open, High = High, Low = Low, Close = Close, Volume = Volume, Symbol = Symbol };
}

sealed class GatewayAccount
{
    public string Id { get; init; } = string.Empty;
    public string? FcmId { get; init; }
    public string? IbId { get; init; }
    public string? DisplayName { get; init; }
}

sealed class GatewayPosition
{
    public string Symbol { get; init; } = string.Empty;
    public string Side { get; init; } = "flat";
    public double Quantity { get; init; }
    public double? AveragePrice { get; init; }
    public double? UnrealizedPnL { get; init; }
    public double? RealizedPnL { get; init; }
}

sealed class GatewayOrder
{
    public string OrderId { get; init; } = string.Empty;
    public string Symbol { get; init; } = string.Empty;
    public string Side { get; init; } = "buy";
    public double Quantity { get; init; }
    public string OrderType { get; init; } = "market";
    public string Status { get; set; } = "working";
    public double FilledQuantity { get; set; }
    public double? AverageFillPrice { get; set; }
    public double? LimitPrice { get; set; }
    public string? RejectReason { get; set; }
    public string? ClientOrderId { get; set; }
}

sealed class GatewayStatistics
{
    public double? DailyPnL { get; set; }
    public double? RealizedPnL { get; set; }
    public double? UnrealizedPnL { get; set; }
    public int OpenPositions { get; set; }
    public int WorkingOrders { get; set; }
    public long UpdatedAt { get; set; }
}

sealed class GatewayAccountState
{
    public GatewayAccount Account { get; init; } = new();
    public double? Balance { get; set; }
    public double? Equity { get; set; }
    public double? BuyingPower { get; set; }
    public double? MarginUsed { get; set; }
    public double? RealizedPnL { get; set; }
    public double? UnrealizedPnL { get; set; }
    public List<GatewayPosition> Positions { get; } = new();
    public List<GatewayOrder> Orders { get; } = new();
    public GatewayStatistics Statistics { get; } = new();
    public long UpdatedAt { get; set; }
}

sealed class RapiSession
{
    private readonly WebSocket browser;
    private readonly JsonSerializerOptions serializerOptions;
    private readonly RapiConfig config = new();
    private readonly SemaphoreSlim sendGate = new(1, 1);
    private readonly CandleBuffer candleBuffer = new();
    private readonly HashSet<string> subscriptions = new(StringComparer.OrdinalIgnoreCase);
    private Assembly? assembly;
    private object? engine;
    // Keep the managed callback instance alive for the entire RAPI+ session.
    // The native engine retains the callback through its interop boundary, but
    // retaining it here also prevents the GC from collecting a dynamic type
    // between login and the first reference-data callback.
    private RCallbacks? callbacks;
    private TaskCompletionSource<object?>? referenceDataWaiter;
    private TaskCompletionSource<object?>? replayWaiter;
    private TaskCompletionSource<object?>? accountListWaiter;
    private TaskCompletionSource<object?>? tradeRouteWaiter;
    private readonly Dictionary<string, TaskCompletionSource<object?>> pnlWaiters = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, TaskCompletionSource<object?>> orderWaiters = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, double> pendingOrderQuantities = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, object> accountHandles = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, GatewayAccount> accounts = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, GatewayAccountState> accountStates = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> tradeRoutes = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> accountSubscriptions = new(StringComparer.OrdinalIgnoreCase);
    private bool tradeRoutesLoaded;
    private string? activeAccountId;
    private bool closed;

    public RapiSession(WebSocket browser, JsonSerializerOptions serializerOptions)
    {
        this.browser = browser;
        this.serializerOptions = serializerOptions;
    }

    public async Task RunAsync()
    {
        try
        {
            var firstMessage = await ReceiveAsync(TimeSpan.FromSeconds(30))
                ?? throw new InvalidOperationException("The gateway received no connect request.");
            if (ReadString(firstMessage, "type") != "connect")
                throw new InvalidOperationException("The first gateway message must be a connect request.");

            var credentials = firstMessage.GetProperty("credentials");
            var username = credentials.GetProperty("username").GetString() ?? string.Empty;
            var password = credentials.GetProperty("password").GetString() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
                throw new InvalidOperationException("Rithmic username and password are required.");

            await ConnectRithmicAsync(username, password);
            await SendAsync(new { type = "connected", symbols = await ResolveSymbolsAsync() });

            while (!closed && browser.State == WebSocketState.Open)
            {
                var message = await ReceiveAsync(Timeout.InfiniteTimeSpan);
                if (message is null) break;
                try
                {
                    await HandleMessageAsync(message.Value);
                }
                catch (Exception exception)
                {
                    await SendErrorAsync(exception.Message, ReadString(message.Value, "requestId"));
                }
            }
        }
        catch (Exception exception)
        {
            await SendErrorAsync(exception.Message, null);
        }
        finally
        {
            await CloseAsync();
        }
    }

    private async Task ConnectRithmicAsync(string username, string password)
    {
        assembly = typeof(RCallbacks).Assembly;
        if (!string.IsNullOrWhiteSpace(config.CertificatePath))
        {
            var certificatePath = Path.GetFullPath(config.CertificatePath);
            if (!File.Exists(certificatePath))
                throw new InvalidOperationException($"Rithmic certificate file was not found at {certificatePath}. Set RITHMIC_CA_FILE to override the bundled certificate.");
            Environment.SetEnvironmentVariable("MML_SSL_CLNT_AUTH_FILE", certificatePath);
        }

        var parameters = Create(assembly, "com.omnesys.rapi.REngineParams");
        Set(parameters, "AppName", "OpenBackTest");
        Set(parameters, "AppVersion", "1.0.0");
        Set(parameters, "DmnSrvrAddr", config.DmnSrvrAddr);
        Set(parameters, "DomainName", config.DomainName);
        Set(parameters, "LicSrvrAddr", config.LicSrvrAddr);
        Set(parameters, "LocBrokAddr", config.LocBrokAddr);
        Set(parameters, "LoggerAddr", config.LoggerAddr);

        var engineType = assembly.GetType("com.omnesys.rapi.REngine", throwOnError: true)!;
        var engineConstructor = engineType.GetConstructor(new[] { parameters.GetType() })
            ?? throw new InvalidOperationException("RAPI+ REngine constructor not found.");
        engine = engineConstructor.Invoke(new[] { parameters });
        CallbackRelay.Set(OnCallback);
        callbacks = new GatewayCallbacks();

        Invoke(engine, "loginRepository", callbacks, null, username, password, config.RepositoryPlant);
        await WaitForStateAsync("RepositorySessionState", "repository login", TimeSpan.FromSeconds(30));

        Invoke(engine, "login", callbacks,
            null, username, password, config.MdPlant,
            null, username, password, config.TsPlant,
            config.PnlPlant,
            null, username, password, config.IhPlant);
        await WaitForStateAsync("SessionState", "market-data login", TimeSpan.FromSeconds(45));

        Console.WriteLine("RAPI+ login succeeded for Rithmic Paper Trading / Chicago Area.");
    }

    private async Task<List<object>> ResolveSymbolsAsync()
    {
        var symbols = new List<object>();
        Invoke(engine!, "listExchanges", new object());
        foreach (var request in config.Symbols)
        {
            var waiter = NewWaiter();
            referenceDataWaiter = waiter;
            try
            {
                // RAPI+ expects the exchange catalog to be requested before
                // symbol reference data, as done by Quantower's connector.
                Invoke(engine!, "getRefData", request.Exchange, request.Symbol, new object());
                var info = await waiter.Task.WaitAsync(TimeSpan.FromSeconds(20));
                var responseCode = ReadInt(info, "RpCode");
                if (responseCode != 0) throw new InvalidOperationException($"Rithmic reference data rejected {request.Exchange}.{request.Symbol} (code {responseCode}).");
                var actualSymbol = ReadString(info, "Symbol") ?? request.Symbol;
                var actualExchange = ReadString(info, "Exchange") ?? request.Exchange;
                var pointValue = ReadDouble(info, "SinglePointValue");
                symbols.Add(new
                {
                    symbol = $"{actualSymbol}.{actualExchange}",
                    displayName = actualSymbol,
                    exchange = actualExchange,
                    assetType = "futures",
                    pointValue = pointValue > 0 ? pointValue : (double?)null
                });
            }
            finally
            {
                referenceDataWaiter = null;
            }
        }
        if (symbols.Count == 0) throw new InvalidOperationException("No Rithmic symbols were configured.");
        return symbols;
    }

    private async Task HandleMessageAsync(JsonElement message)
    {
        var type = ReadString(message, "type");
        var requestId = ReadString(message, "requestId");
        switch (type)
        {
            case "subscribe":
                var subscribeSymbol = ParseSymbol(ReadString(message, "symbol"));
                EnsureSubscribed(subscribeSymbol.Exchange, subscribeSymbol.Symbol);
                break;
            case "unsubscribe":
                var unsubscribeSymbol = ParseSymbol(ReadString(message, "symbol"));
                Invoke(engine!, "unsubscribe", unsubscribeSymbol.Exchange, unsubscribeSymbol.Symbol);
                subscriptions.Remove(Qualify(unsubscribeSymbol.Symbol, unsubscribeSymbol.Exchange));
                break;
            case "history":
                var historySymbol = ParseSymbol(ReadString(message, "symbol"));
                EnsureSubscribed(historySymbol.Exchange, historySymbol.Symbol);
                var requestedLimit = ReadInt(message, "limit");
                var limit = Math.Clamp(requestedLimit <= 0 ? 1_000 : requestedLimit, 1, config.MaxHistoryMinutes);
                await ReplayHistoryAsync(historySymbol.Exchange, historySymbol.Symbol, limit);
                await SendAsync(new
                {
                    type = "history",
                    requestId,
                    candles = candleBuffer.Get(Qualify(historySymbol.Symbol, historySymbol.Exchange), limit)
                });
                break;
            case "accounts":
                await SendAsync(new { type = "accounts", requestId, accounts = await ResolveAccountsAsync() });
                break;
            case "accountState":
                var accountId = ReadString(message, "accountId") ?? throw new InvalidOperationException("An accountId is required.");
                var accountState = await LoadAccountStateAsync(accountId);
                await SendAsync(new { type = "accountState", requestId, state = accountState });
                break;
            case "accountSubscribe":
                var subscribeAccountId = ReadString(message, "accountId") ?? throw new InvalidOperationException("An accountId is required.");
                await LoadAccountStateAsync(subscribeAccountId);
                accountSubscriptions.Add(subscribeAccountId);
                await SendAsync(new { type = "accountState", state = accountStates[subscribeAccountId] });
                break;
            case "accountUnsubscribe":
                var unsubscribeAccountId = ReadString(message, "accountId");
                if (!string.IsNullOrWhiteSpace(unsubscribeAccountId)) accountSubscriptions.Remove(unsubscribeAccountId);
                break;
            case "tradeRoutes":
                await LoadTradeRoutesAsync();
                await SendAsync(new { type = "tradeRoutes", requestId, routes = tradeRoutes });
                break;
            case "order":
                var order = await PlaceOrderAsync(message);
                await SendAsync(new { type = "orderUpdate", requestId, update = order });
                break;
            case "cancelOrder":
                var cancelled = await CancelOrderAsync(ReadString(message, "orderId"));
                await SendAsync(new { type = "orderUpdate", requestId, update = cancelled });
                break;
            case "cancelAll":
                await CancelAllOrdersAsync(ReadString(message, "symbol"));
                await SendAsync(new { type = "cancelAll", requestId });
                break;
            case "flatten":
                await FlattenAsync(ReadString(message, "symbol"));
                await SendAsync(new { type = "flatten", requestId });
                break;
            default:
                throw new InvalidOperationException($"Unknown Rithmic gateway message: {type}");
        }
    }

    private async Task<List<GatewayAccount>> ResolveAccountsAsync()
    {
        if (accounts.Count > 0) return accounts.Values.ToList();

        var waiter = NewWaiter();
        accountListWaiter = waiter;
        try
        {
            Invoke(engine!, "getAccounts", "A");
            var info = await waiter.Task.WaitAsync(TimeSpan.FromSeconds(20));
            var responseCode = ReadInt(info, "RpCode");
            if (responseCode != 0)
                throw new InvalidOperationException($"Rithmic account lookup rejected (code {responseCode}).");

            var rawAccounts = Property(info, "Accounts") as IEnumerable
                ?? Property(info, "asAccountInfoArray") as IEnumerable;
            if (rawAccounts is not null)
            {
                foreach (var rawAccount in rawAccounts.Cast<object>())
                {
                    var account = ToGatewayAccount(rawAccount);
                    if (string.IsNullOrWhiteSpace(account.Id)) continue;
                    accounts[account.Id] = account;
                    accountHandles[account.Id] = rawAccount;
                }
            }
            if (accounts.Count == 0) throw new InvalidOperationException("Rithmic returned no trading accounts.");
            return accounts.Values.ToList();
        }
        finally
        {
            accountListWaiter = null;
        }
    }

    private async Task LoadTradeRoutesAsync()
    {
        if (tradeRoutesLoaded || !string.IsNullOrWhiteSpace(config.TradeRoute))
        {
            tradeRoutesLoaded = true;
            return;
        }

        var waiter = NewWaiter();
        tradeRouteWaiter = waiter;
        try
        {
            Invoke(engine!, "listTradeRoutes", new object());
            var info = await waiter.Task.WaitAsync(TimeSpan.FromSeconds(20));
            var responseCode = ReadInt(info, "RpCode");
            if (responseCode != 0)
                throw new InvalidOperationException($"Rithmic trade-route lookup rejected (code {responseCode}).");

            var rawRoutes = Property(info, "TradeRoutes") as IEnumerable;
            if (rawRoutes is not null)
            {
                foreach (var rawRoute in rawRoutes.Cast<object>())
                {
                    var route = ReadString(rawRoute, "TradeRoute");
                    if (string.IsNullOrWhiteSpace(route)) continue;
                    var exchange = ReadString(rawRoute, "Exchange") ?? "*";
                    var isDefault = IsTruthy(ReadString(rawRoute, "Default"));
                    if (!tradeRoutes.ContainsKey(exchange) || isDefault)
                        tradeRoutes[exchange] = route;
                }
            }

            tradeRoutesLoaded = true;
            Console.WriteLine($"RAPI+ trade routes loaded: {string.Join(", ", tradeRoutes.Select(item => $"{item.Key}={item.Value}"))}");
        }
        finally
        {
            tradeRouteWaiter = null;
        }
    }

    private async Task<string> ResolveTradeRouteAsync(string exchange)
    {
        if (!string.IsNullOrWhiteSpace(config.TradeRoute)) return config.TradeRoute;
        await LoadTradeRoutesAsync();
        if (tradeRoutes.TryGetValue(exchange, out var route)) return route;
        if (tradeRoutes.TryGetValue("*", out route)) return route;
        if (tradeRoutes.Count == 1) return tradeRoutes.Values.Single();
        throw new InvalidOperationException($"No Rithmic trade route is available for {exchange}. Set RITHMIC_TRADE_ROUTE or confirm the account has an enabled route.");
    }

    private GatewayAccount ToGatewayAccount(object rawAccount)
    {
        var accountId = ReadString(rawAccount, "sAccountId") ?? ReadString(rawAccount, "AccountId") ?? string.Empty;
        var fcmId = ReadString(rawAccount, "sFcmId") ?? ReadString(rawAccount, "FcmId");
        var ibId = ReadString(rawAccount, "sIbId") ?? ReadString(rawAccount, "IbId");
        return new GatewayAccount
        {
            Id = accountId,
            FcmId = fcmId,
            IbId = ibId,
            DisplayName = string.IsNullOrWhiteSpace(fcmId) ? accountId : $"{accountId} · {fcmId}"
        };
    }

    private async Task<GatewayAccountState> LoadAccountStateAsync(string accountId)
    {
        await ResolveAccountsAsync();
        if (!accountHandles.TryGetValue(accountId, out var rawAccount) || !accounts.TryGetValue(accountId, out var account))
            throw new InvalidOperationException($"Unknown Rithmic trading account: {accountId}");

        activeAccountId = accountId;
        if (!accountStates.TryGetValue(accountId, out var state))
        {
            state = new GatewayAccountState { Account = account };
            accountStates[accountId] = state;
        }

        EnsureAccountFeeds(rawAccount, accountId);
        var waiter = NewWaiter();
        pnlWaiters[accountId] = waiter;
        try
        {
            Invoke(engine!, "replayPnl", rawAccount, new object());
            try { await waiter.Task.WaitAsync(TimeSpan.FromSeconds(20)); }
            catch (TimeoutException) { }
        }
        finally
        {
            pnlWaiters.Remove(accountId);
        }
        state.UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        return state;
    }

    private void EnsureAccountFeeds(object rawAccount, string accountId)
    {
        if (accountStates.ContainsKey(accountId) && accountStates[accountId].UpdatedAt > 0) return;
        Invoke(engine!, "subscribePnl", rawAccount);
        Invoke(engine!, "subscribeOrder", rawAccount);
    }

    private void EnsureSubscribed(string exchange, string symbol)
    {
        var key = Qualify(symbol, exchange);
        if (subscriptions.Contains(key)) return;
        var flagsType = assembly!.GetType("com.omnesys.rapi.SubscriptionFlags", throwOnError: true)!;
        var prints = Enum.Parse(flagsType, "Prints");
        Invoke(engine!, "subscribe", exchange, symbol, prints, new object());
        subscriptions.Add(key);
    }

    private async Task ReplayHistoryAsync(string exchange, string symbol, int limit)
    {
        var end = (int)DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var remaining = limit;
        while (remaining > 0)
        {
            var chunk = Math.Min(remaining, config.ReplayChunkMinutes);
            var hasMoreHistory = await ReplayHistoryWindowAsync(exchange, symbol, end - (chunk * 60), end);
            if (!hasMoreHistory) break;
            end -= chunk * 60;
            remaining -= chunk;
        }
    }

    private async Task<bool> ReplayHistoryWindowAsync(string exchange, string symbol, int start, int end)
    {
        var waiter = NewWaiter();
        replayWaiter = waiter;
        try
        {
            Invoke(engine!, "replayTrades", exchange, symbol, start, end, new object());
            var info = await waiter.Task.WaitAsync(TimeSpan.FromSeconds(90));
            var responseCode = ReadInt(info, "RpCode");
            // Rithmic uses code 7 when a replay window has no older data. This
            // is a normal end-of-history condition, not a failed chart load.
            if (responseCode == 7) return false;
            if (responseCode != 0)
                throw new InvalidOperationException($"Rithmic trade replay rejected {exchange}.{symbol} (code {responseCode}).");
            return true;
        }
        finally
        {
            replayWaiter = null;
        }
    }

    private void OnCallback(string eventName, object? info)
    {
        if (info is null) return;
        switch (eventName)
        {
            case "AccountList":
                accountListWaiter?.TrySetResult(info);
                break;
            case "TradeRouteList":
                tradeRouteWaiter?.TrySetResult(info);
                break;
            case "RefData":
                referenceDataWaiter?.TrySetResult(info);
                break;
            case "PnlUpdate":
                ProcessPnl(info);
                break;
            case "PnlReplay":
                ProcessPnlReplay(info);
                break;
            case "LineUpdate":
                ProcessLineUpdate(info);
                break;
            case "FillReport":
                ProcessFillReport(info);
                break;
            case "TradeReplay":
                replayWaiter?.TrySetResult(info);
                break;
            case "TradePrint":
                ProcessTrade(info);
                break;
            case "Alert":
                var text = ReadString(info, "Text") ?? ReadString(info, "Message");
                if (!string.IsNullOrWhiteSpace(text)) Console.Error.WriteLine($"RAPI+ alert: {text}");
                break;
        }
    }

    private void ProcessPnlReplay(object info)
    {
        var array = Property(info, "PnlInfoList") as IEnumerable
            ?? Property(info, "asPnlInfoArray") as IEnumerable
            ?? Property(info, "asPnlArray") as IEnumerable;
        if (array is not null)
        {
            foreach (var item in array.Cast<object>()) ProcessPnl(item);
        }
        else
        {
            ProcessPnl(info);
        }

        var accountId = ReadString(Property(info, "Account"), "AccountId")
            ?? ReadString(Property(info, "oAccount"), "sAccountId")
            ?? activeAccountId;
        if (accountId is not null && pnlWaiters.TryGetValue(accountId, out var waiter)) waiter.TrySetResult(info);
    }

    private void ProcessPnl(object info)
    {
        var rawAccount = Property(info, "Account") ?? Property(info, "oAccount");
        var accountId = ReadString(rawAccount, "AccountId")
            ?? ReadString(rawAccount, "sAccountId")
            ?? ReadString(info, "AccountId")
            ?? ReadString(info, "sAccountId")
            ?? activeAccountId;
        if (string.IsNullOrWhiteSpace(accountId) || !accounts.TryGetValue(accountId, out var account)) return;

        if (!accountStates.TryGetValue(accountId, out var state))
        {
            state = new GatewayAccountState { Account = account };
            accountStates[accountId] = state;
        }

        state.Balance = FirstDouble(info, "AccountBalance", "CashOnHand", "Balance", "StartingBalance") ?? state.Balance;
        var openPnl = FirstDouble(info, "OpenPnl", "UnrealizedPnl", "UnrealizedPnL");
        state.Equity = state.Balance.HasValue && openPnl.HasValue ? state.Balance.Value + openPnl.Value : state.Equity;
        state.BuyingPower = FirstDouble(info, "AvailableBuyingPower", "BuyingPower", "ExcessLiquidity", "AvailableFunds") ?? state.BuyingPower;
        state.MarginUsed = FirstDouble(info, "ReservedMargin", "Margin", "MarginUsed", "InitialMargin") ?? state.MarginUsed;
        state.RealizedPnL = FirstDouble(info, "ClosedPnl", "RealizedPnl", "RealizedPnL", "DailyPnl") ?? state.RealizedPnL;
        state.UnrealizedPnL = openPnl ?? state.UnrealizedPnL;

        var ticker = ReadString(info, "Symbol") ?? ReadString(info, "Ticker");
        var exchange = ReadString(info, "Exchange");
        var quantity = FirstDouble(info, "Position", "OpenPosition", "Quantity", "OpenQuantity") ?? 0;
        if (!string.IsNullOrWhiteSpace(ticker))
        {
            var symbol = string.IsNullOrWhiteSpace(exchange) ? ticker : $"{ticker}.{exchange}";
            var existing = state.Positions.FindIndex(position => position.Symbol.Equals(symbol, StringComparison.OrdinalIgnoreCase));
            if (Math.Abs(quantity) <= 0)
            {
                if (existing >= 0) state.Positions.RemoveAt(existing);
            }
            else
            {
                var position = new GatewayPosition
                {
                    Symbol = symbol,
                    Side = quantity > 0 ? "long" : "short",
                    Quantity = Math.Abs(quantity),
                    AveragePrice = FirstDouble(info, "AvgOpenFillPrice", "AverageOpenPrice", "AveragePrice", "OpenPrice"),
                    UnrealizedPnL = openPnl,
                    RealizedPnL = FirstDouble(info, "ClosedPnl", "RealizedPnl", "RealizedPnL")
                };
                if (existing >= 0) state.Positions[existing] = position;
                else state.Positions.Add(position);
            }
        }

        state.Statistics.DailyPnL = FirstDouble(info, "ClosedPnl", "DailyPnl", "RealizedPnl") ?? state.Statistics.DailyPnL;
        state.Statistics.RealizedPnL = state.RealizedPnL;
        state.Statistics.UnrealizedPnL = state.UnrealizedPnL;
        var workingQuantity = (FirstDouble(info, "BuyWorkingQty") ?? 0) + (FirstDouble(info, "SellWorkingQty") ?? 0);
        state.Statistics.WorkingOrders = workingQuantity > 0 ? Math.Max(1, state.Statistics.WorkingOrders) : state.Statistics.WorkingOrders;
        state.Statistics.OpenPositions = state.Positions.Count;
        state.UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        if (accountSubscriptions.Contains(accountId))
            _ = SendAsync(new { type = "accountState", state });
    }

    private void ProcessLineUpdate(object info)
    {
        var rawAccount = Property(info, "Account") ?? Property(info, "oAccount");
        var accountId = ReadString(rawAccount, "AccountId")
            ?? ReadString(rawAccount, "sAccountId")
            ?? activeAccountId;
        if (string.IsNullOrWhiteSpace(accountId) || !accounts.ContainsKey(accountId)) return;

        var orderId = ReadString(info, "OrderNum") ?? ReadString(info, "OrderNumber");
        var symbol = ReadString(info, "Symbol") ?? ReadString(info, "Ticker") ?? string.Empty;
        if (string.IsNullOrWhiteSpace(orderId) || string.IsNullOrWhiteSpace(symbol)) return;

        var rawStatus = ReadString(info, "Status") ?? string.Empty;
        var completion = ReadString(info, "CompletionReason") ?? string.Empty;
        var isCancelled = rawStatus.Contains("cancel", StringComparison.OrdinalIgnoreCase) || completion.Contains("cancel", StringComparison.OrdinalIgnoreCase) || completion.Equals("C", StringComparison.OrdinalIgnoreCase);
        var isRejected = rawStatus.Contains("reject", StringComparison.OrdinalIgnoreCase) || completion.Contains("reject", StringComparison.OrdinalIgnoreCase) || completion.Equals("R", StringComparison.OrdinalIgnoreCase);
        var isFilled = (rawStatus.Contains("complete", StringComparison.OrdinalIgnoreCase) && completion.Contains("fill", StringComparison.OrdinalIgnoreCase)) || completion.Equals("F", StringComparison.OrdinalIgnoreCase);
        var status = isCancelled
            ? "cancelled"
            : isRejected
                ? "rejected"
                : isFilled
                    ? "filled"
                    : "working";
        var side = (ReadString(info, "BuySellType") ?? "B").Equals("S", StringComparison.OrdinalIgnoreCase) ? "sell" : "buy";
        var filledQuantity = FirstDouble(info, "Filled", "TotalFilled") ?? 0;
        var quantityToFill = FirstDouble(info, "QuantityToFill");
        var clientOrderId = ReadString(info, "UserMsg");
        if (string.IsNullOrWhiteSpace(clientOrderId))
        {
            var tag = ReadString(info, "Tag");
            clientOrderId = tag?.StartsWith("openbacktest-", StringComparison.OrdinalIgnoreCase) == true ? tag : null;
        }
        var quantity = FirstDouble(info, "Quantity", "MaxShowQty")
            ?? (quantityToFill.HasValue ? Math.Max(quantityToFill.Value + filledQuantity, filledQuantity) : 0);
        if (quantity <= 0 && clientOrderId is not null && pendingOrderQuantities.TryGetValue(clientOrderId, out var requestedQuantity))
            quantity = requestedQuantity;
        if (!isCancelled && !isRejected && !isFilled && filledQuantity > 0 && quantity > filledQuantity)
            status = "partially-filled";
        var exchange = ReadString(info, "Exchange");
        var rejectReason = isRejected ? ReadString(info, "Text") ?? ReadString(info, "Remarks") : null;
        var rawOrderType = ReadString(info, "OrderType") ?? "M";
        var orderType = rawOrderType.Equals("L", StringComparison.OrdinalIgnoreCase)
            || rawOrderType.Contains("limit", StringComparison.OrdinalIgnoreCase)
            ? "limit"
            : "market";
        var limitPrice = orderType == "limit" ? FirstDouble(info, "PriceToFill", "Price") : null;
        var state = accountStates.TryGetValue(accountId, out var existing)
            ? existing
            : new GatewayAccountState { Account = accounts[accountId] };
        accountStates[accountId] = state;
        var order = new GatewayOrder
        {
            OrderId = orderId,
            Symbol = string.IsNullOrWhiteSpace(ReadString(info, "Exchange")) ? symbol : $"{symbol}.{ReadString(info, "Exchange")}",
            Side = side,
            Quantity = quantity,
            OrderType = orderType,
            Status = status,
            FilledQuantity = filledQuantity,
            AverageFillPrice = FirstDouble(info, "AvgFillPrice", "AverageFillPrice"),
            LimitPrice = limitPrice,
            RejectReason = rejectReason,
            ClientOrderId = clientOrderId
        };
        var existingOrder = state.Orders.FindIndex(item => item.OrderId.Equals(orderId, StringComparison.OrdinalIgnoreCase));
        if (existingOrder >= 0) state.Orders[existingOrder] = order;
        else state.Orders.Add(order);
        state.Statistics.WorkingOrders = state.Orders.Count(item => item.Status is "working" or "partially-filled");
        state.UpdatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        Console.WriteLine($"RAPI+ line {orderId} {order.Status} {side} {quantity:0.####}/{filledQuantity:0.####} {order.Symbol}{(string.IsNullOrWhiteSpace(rejectReason) ? string.Empty : $" reason={rejectReason}")}");

        _ = SendAsync(new
        {
            type = "orderUpdate",
            update = new
            {
                orderId,
                accountId,
                symbol = string.IsNullOrWhiteSpace(exchange) ? symbol : $"{symbol}.{exchange}",
                side,
                quantity,
                orderType,
                limitPrice,
                status,
                filledQuantity,
                averageFillPrice = order.AverageFillPrice,
                rejectReason,
                clientOrderId
            }
        });
        if (clientOrderId is not null && orderWaiters.TryGetValue(clientOrderId, out var waiter))
        {
            waiter.TrySetResult(new
            {
                orderId,
                accountId,
                symbol = order.Symbol,
                side,
                quantity,
                orderType,
                limitPrice,
                status,
                filledQuantity,
                averageFillPrice = order.AverageFillPrice,
                rejectReason,
                clientOrderId
            });
        }
        if (accountSubscriptions.Contains(accountId)) _ = SendAsync(new { type = "accountState", state });
    }

    private void ProcessFillReport(object info)
    {
        var rawAccount = Property(info, "Account") ?? Property(info, "oAccount");
        var accountId = ReadString(rawAccount, "AccountId")
            ?? ReadString(rawAccount, "sAccountId")
            ?? activeAccountId;
        var orderId = ReadString(info, "OrderNum") ?? ReadString(info, "OrderNumber");
        var symbol = ReadString(info, "Symbol") ?? ReadString(info, "Ticker");
        var quantity = FirstDouble(info, "FillSize", "Quantity") ?? 0;
        var price = FirstDouble(info, "FillPrice", "AverageFillPrice") ?? 0;
        if (string.IsNullOrWhiteSpace(accountId) || string.IsNullOrWhiteSpace(orderId) || string.IsNullOrWhiteSpace(symbol) || quantity <= 0 || price <= 0) return;

        var side = (ReadString(info, "BuySellType") ?? ReadString(info, "FillSide") ?? "B").Equals("S", StringComparison.OrdinalIgnoreCase) ? "sell" : "buy";
        _ = SendAsync(new
        {
            type = "fill",
            fill = new
            {
                orderId,
                accountId,
                symbol,
                side,
                quantity,
                price,
                time = ReadLong(info, "Ssboe")
            }
        });
    }

    private async Task<object> PlaceOrderAsync(JsonElement message)
    {
        var order = message.GetProperty("order");
        var accountId = ReadString(order, "accountId") ?? activeAccountId
            ?? throw new InvalidOperationException("Select a trading account before placing an order.");
        await ResolveAccountsAsync();
        if (!accountHandles.TryGetValue(accountId, out var rawAccount))
            throw new InvalidOperationException($"Unknown Rithmic trading account: {accountId}");

        var symbol = ReadString(order, "symbol") ?? throw new InvalidOperationException("An order symbol is required.");
        var parsed = ParseSymbol(symbol);
        var quantity = ReadDouble(order, "quantity");
        if (quantity <= 0) throw new InvalidOperationException("Order quantity must be greater than zero.");
        var roundedQuantity = Math.Round(quantity);
        if (Math.Abs(quantity - roundedQuantity) > 0.000001)
            throw new InvalidOperationException("Rithmic futures order quantity must be a whole number of contracts.");
        var side = (ReadString(order, "side") ?? "buy").Equals("sell", StringComparison.OrdinalIgnoreCase) ? "S" : "B";
        var orderType = (ReadString(order, "orderType") ?? "market").ToLowerInvariant();
        if (orderType is not ("market" or "limit"))
            throw new InvalidOperationException("Rithmic live mode currently supports market and limit orders only.");
        var limitPrice = orderType == "limit" ? ReadDouble(order, "limitPrice") : 0;
        if (orderType == "limit" && limitPrice <= 0)
            throw new InvalidOperationException("A positive limitPrice is required for a Rithmic limit order.");
        var clientOrderId = ReadString(order, "clientOrderId") ?? $"openbacktest-{Guid.NewGuid():N}";
        var tradeRoute = await ResolveTradeRouteAsync(parsed.Exchange);

        var paramsType = assembly!.GetType(orderType == "limit" ? "com.omnesys.rapi.LimitOrderParams" : "com.omnesys.rapi.MarketOrderParams", throwOnError: true)!;
        var parameters = Activator.CreateInstance(paramsType)
            ?? throw new InvalidOperationException("Could not create Rithmic market-order parameters.");
        SetAny(parameters, "Account", rawAccount);
        SetAny(parameters, "Exchange", parsed.Exchange);
        SetAny(parameters, "Symbol", parsed.Symbol);
        SetAny(parameters, "TradeRoute", tradeRoute);
        SetAny(parameters, "BuySellType", side);
        SetAny(parameters, "Qty", Convert.ToInt64(roundedQuantity));
        if (orderType == "limit") SetAny(parameters, "Price", limitPrice);
        SetAny(parameters, "Duration", "DAY");
        SetAny(parameters, "EntryType", orderType == "limit" ? "L" : "M");
        SetAny(parameters, "Tag", "OpenBackTest");
        SetAny(parameters, "TradingAlgorithm", "OpenBackTest");
        SetAny(parameters, "UserMsg", clientOrderId);

        var fallbackUpdate = new
        {
            orderId = ReadString(parameters, "OrderNum") ?? ReadString(parameters, "OrderNumber") ?? $"rithmic-{Guid.NewGuid():N}",
            accountId,
            symbol,
            side = side == "B" ? "buy" : "sell",
            quantity,
            orderType,
            limitPrice = orderType == "limit" ? limitPrice : (double?)null,
            status = "working",
            filledQuantity = 0,
            clientOrderId,
            tradeRoute
        };

        var waiter = NewWaiter();
        orderWaiters[clientOrderId] = waiter;
        pendingOrderQuantities[clientOrderId] = quantity;
        try
        {
            Console.WriteLine($"RAPI+ send {side} {orderType} {quantity:0.####} {parsed.Symbol}.{parsed.Exchange}{(orderType == "limit" ? $" @ {limitPrice:0.########}" : string.Empty)} route={tradeRoute} account={accountId} client={clientOrderId}");
            Invoke(engine!, "sendOrder", parameters);
            try
            {
                var update = await waiter.Task.WaitAsync(TimeSpan.FromSeconds(15));
                if (update is not null) return update;
            }
            catch (TimeoutException)
            {
                Console.Error.WriteLine($"RAPI+ order acknowledgement timed out for {clientOrderId}; continuing to stream line updates.");
            }
            return fallbackUpdate;
        }
        finally
        {
            orderWaiters.Remove(clientOrderId);
            pendingOrderQuantities.Remove(clientOrderId);
        }
    }

    private async Task<object> CancelOrderAsync(string? orderId)
    {
        if (string.IsNullOrWhiteSpace(orderId)) throw new InvalidOperationException("An orderId is required.");
        await ResolveAccountsAsync();
        if (activeAccountId is null || !accountHandles.TryGetValue(activeAccountId, out var rawAccount))
            throw new InvalidOperationException("Select a trading account before cancelling an order.");
        Invoke(engine!, "cancelOrder", rawAccount, orderId, "M", "OpenBackTest", "", "OpenBackTest", new object());
        var existing = accountStates.TryGetValue(activeAccountId, out var state)
            ? state.Orders.FirstOrDefault(item => item.OrderId.Equals(orderId, StringComparison.OrdinalIgnoreCase))
            : null;
        return new
        {
            orderId,
            accountId = activeAccountId,
            symbol = existing?.Symbol ?? string.Empty,
            side = existing?.Side ?? "buy",
            quantity = existing?.Quantity ?? 0,
            orderType = existing?.OrderType ?? "market",
            limitPrice = existing?.LimitPrice,
            status = "cancelled",
            filledQuantity = existing?.FilledQuantity ?? 0,
            averageFillPrice = existing?.AverageFillPrice
        };
    }

    private async Task CancelAllOrdersAsync(string? symbol)
    {
        await ResolveAccountsAsync();
        if (activeAccountId is null || !accountHandles.TryGetValue(activeAccountId, out var rawAccount))
            throw new InvalidOperationException("Select a trading account before cancelling orders.");
        Invoke(engine!, "cancelAllOrders", rawAccount, "M", "OpenBackTest", "OpenBackTest");
    }

    private async Task FlattenAsync(string? symbol)
    {
        await ResolveAccountsAsync();
        if (activeAccountId is null || !accountHandles.TryGetValue(activeAccountId, out var rawAccount))
            throw new InvalidOperationException("Select a trading account before flattening a position.");
        if (string.IsNullOrWhiteSpace(symbol)) throw new InvalidOperationException("A symbol is required to flatten.");
        var parsed = ParseSymbol(symbol);
        // Cancel first so a working opening order cannot re-enter the position
        // while the broker is processing the flatten request.
        Invoke(engine!, "cancelAllOrders", rawAccount, "M", "OpenBackTest", "OpenBackTest");
        await Task.Delay(250);
        Invoke(engine!, "exitPosition", rawAccount, parsed.Exchange, parsed.Symbol, "M", "OpenBackTest", "OpenBackTest", "", "OpenBackTest", new object());
    }

    private void ProcessTrade(object info)
    {
        var price = ReadDouble(info, "Price");
        var size = ReadLong(info, "Size");
        if (price <= 0 || size <= 0) return;
        var firstSymbol = config.Symbols[0];
        var symbol = ReadString(info, "Symbol") ?? firstSymbol.Symbol;
        var exchange = ReadString(info, "Exchange") ?? firstSymbol.Exchange;
        var timestamp = ReadLong(info, "Ssboe");
        if (timestamp <= 0) timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        var candle = candleBuffer.Add(symbol, exchange, price, size, timestamp);
        var callbackType = ReadString(info, "CallbackType") ?? string.Empty;
        if (!callbackType.Contains("History", StringComparison.OrdinalIgnoreCase))
            _ = SendAsync(new { type = "candle", candle });
    }

    private async Task WaitForStateAsync(string property, string operation, TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            var state = ReadString(engine, property) ?? string.Empty;
            if (state.Equals("LoggedIn", StringComparison.OrdinalIgnoreCase)) return;
            await Task.Delay(500);
        }
        throw new TimeoutException($"Rithmic {operation} timed out (state: {ReadString(engine, property) ?? "unknown"}).");
    }

    private async Task CloseAsync()
    {
        if (closed) return;
        closed = true;
        try
        {
            foreach (var qualified in subscriptions.ToArray())
            {
                var parsed = ParseSymbol(qualified);
                Invoke(engine!, "unsubscribe", parsed.Exchange, parsed.Symbol);
            }
            foreach (var rawAccount in accountHandles.Values)
            {
                try { Invoke(engine!, "unsubscribePnl", rawAccount); } catch { }
                try { Invoke(engine!, "unsubscribeOrder", rawAccount); } catch { }
            }
            if (engine is not null)
            {
                Invoke(engine, "logout");
                Invoke(engine, "logoutRepository");
                Invoke(engine, "shutdown");
            }
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine($"RAPI+ shutdown: {exception.Message}");
        }
        finally
        {
            CallbackRelay.Clear();
            accountSubscriptions.Clear();
            foreach (var waiter in orderWaiters.Values) waiter.TrySetResult(null);
            orderWaiters.Clear();
            pendingOrderQuantities.Clear();
            if (browser.State == WebSocketState.Open)
            {
                try { await browser.CloseAsync(WebSocketCloseStatus.NormalClosure, "closed", CancellationToken.None); }
                catch { }
            }
        }
    }

    private async Task SendErrorAsync(string message, string? requestId)
    {
        if (browser.State != WebSocketState.Open) return;
        await SendAsync(new { type = "error", requestId, message });
    }

    private async Task SendAsync(object payload)
    {
        if (browser.State != WebSocketState.Open || closed) return;
        var bytes = JsonSerializer.SerializeToUtf8Bytes(payload, serializerOptions);
        await sendGate.WaitAsync();
        try
        {
            if (browser.State == WebSocketState.Open)
                await browser.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None);
        }
        finally
        {
            sendGate.Release();
        }
    }

    private async Task<JsonElement?> ReceiveAsync(TimeSpan timeout)
    {
        using var cancellation = timeout == Timeout.InfiniteTimeSpan
            ? new CancellationTokenSource()
            : new CancellationTokenSource(timeout);
        var buffer = new byte[8192];
        using var message = new MemoryStream();
        WebSocketReceiveResult result;
        do
        {
            result = await browser.ReceiveAsync(buffer, cancellation.Token);
            if (result.MessageType == WebSocketMessageType.Close) return null;
            message.Write(buffer, 0, result.Count);
        } while (!result.EndOfMessage);

        using var document = JsonDocument.Parse(message.ToArray());
        return document.RootElement.Clone();
    }

    private static object Create(Assembly assembly, string typeName)
        => Activator.CreateInstance(assembly.GetType(typeName, throwOnError: true)!)
            ?? throw new InvalidOperationException($"Could not create RAPI+ {typeName}.");

    private static void Set(object target, string property, string value)
    {
        var propertyInfo = target.GetType().GetProperty(property)
            ?? throw new InvalidOperationException($"RAPI+ property not found: {property}");
        propertyInfo.SetValue(target, value);
    }

    private static void SetAny(object target, string property, object value)
    {
        var propertyInfo = target.GetType().GetProperty(property, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        if (propertyInfo is null || !propertyInfo.CanWrite) return;
        if (propertyInfo.PropertyType.IsInstanceOfType(value))
        {
            propertyInfo.SetValue(target, value);
            return;
        }
        try
        {
            propertyInfo.SetValue(target, Convert.ChangeType(value, Nullable.GetUnderlyingType(propertyInfo.PropertyType) ?? propertyInfo.PropertyType, CultureInfo.InvariantCulture));
        }
        catch (InvalidCastException) { }
        catch (FormatException) { }
        catch (ArgumentException) { }
    }

    private static object? Invoke(object target, string method, params object?[] arguments)
    {
        var candidates = target.GetType().GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)
            .Where(candidate => candidate.Name == method && candidate.GetParameters().Length == arguments.Length)
            .ToArray();
        var compatible = candidates
            .Where(candidate => candidate.GetParameters().Zip(arguments, (parameter, argument) => IsCompatible(parameter.ParameterType, argument)).All(match => match))
            .ToArray();
        if (compatible.Length == 0)
            throw new InvalidOperationException($"RAPI+ method not found for compatible arguments: {method}/{arguments.Length}");

        var methodInfo = compatible
            .OrderByDescending(candidate => candidate.GetParameters()
                .Zip(arguments, (parameter, argument) => argument is not null && parameter.ParameterType == argument.GetType())
                .Count(match => match))
            .First();
        try
        {
            return methodInfo.Invoke(target, arguments);
        }
        catch (TargetInvocationException exception) when (exception.InnerException is not null)
        {
            throw exception.InnerException;
        }
    }

    private static bool IsCompatible(Type parameterType, object? argument)
    {
        if (argument is null)
            return !parameterType.IsValueType || Nullable.GetUnderlyingType(parameterType) is not null;
        return parameterType.IsInstanceOfType(argument);
    }

    private TaskCompletionSource<object?> NewWaiter()
        => new(TaskCreationOptions.RunContinuationsAsynchronously);

    private static object? Property(object? target, string property)
        => target?.GetType().GetProperty(property, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)?.GetValue(target);

    private static string? ReadString(object? target, string property)
        => Property(target, property)?.ToString();

    private static string? ReadString(JsonElement element, string property)
        => element.TryGetProperty(property, out var value) && value.ValueKind != JsonValueKind.Null ? value.GetString() : null;

    private static bool IsTruthy(string? value)
        => value is not null && (value.Equals("true", StringComparison.OrdinalIgnoreCase)
            || value.Equals("yes", StringComparison.OrdinalIgnoreCase)
            || value.Equals("y", StringComparison.OrdinalIgnoreCase)
            || value.Equals("1", StringComparison.OrdinalIgnoreCase));

    private static double ReadDouble(JsonElement element, string property)
    {
        if (!element.TryGetProperty(property, out var value)) return 0;
        if (value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number)) return number;
        return double.TryParse(value.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out number) ? number : 0;
    }

    private static double? FirstDouble(object target, params string[] properties)
    {
        foreach (var property in properties)
        {
            var value = UnwrapValue(Property(target, property));
            if (value is null) continue;
            if (value is double number && double.IsFinite(number)) return number;
            if (double.TryParse(value.ToString(), NumberStyles.Float, CultureInfo.InvariantCulture, out number) && double.IsFinite(number)) return number;
        }
        return null;
    }

    private static object? UnwrapValue(object? value)
    {
        if (value is null) return null;
        var use = Property(value, "Use");
        if (use is bool shouldUse && !shouldUse) return null;
        return Property(value, "Value") ?? value;
    }

    private static int ReadInt(object? target, string property)
        => int.TryParse(ReadString(target, property), NumberStyles.Integer, CultureInfo.InvariantCulture, out var value) ? value : 0;

    private static int ReadInt(JsonElement element, string property)
    {
        if (!element.TryGetProperty(property, out var value)) return 0;
        return value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) ? number : 0;
    }

    private static long ReadLong(object? target, string property)
        => long.TryParse(ReadString(target, property), NumberStyles.Integer, CultureInfo.InvariantCulture, out var value) ? value : 0;

    private static double ReadDouble(object? target, string property)
        => double.TryParse(ReadString(target, property), NumberStyles.Float, CultureInfo.InvariantCulture, out var value) ? value : 0;

    private (string Symbol, string Exchange) ParseSymbol(string? qualified)
    {
        var firstSymbol = config.Symbols[0];
        var value = string.IsNullOrWhiteSpace(qualified)
            ? Qualify(firstSymbol.Symbol, firstSymbol.Exchange)
            : qualified;
        var separator = value.LastIndexOf('.');
        return separator > 0
            ? (value[..separator], value[(separator + 1)..])
            : (value, config.DefaultExchange);
    }

    private static string Qualify(string symbol, string exchange) => $"{symbol}.{exchange}";
}
