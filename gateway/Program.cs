using System.Globalization;
using System.Net;
using System.Net.WebSockets;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using com.omnesys.rapi;

var rapiDllPath = Environment.GetEnvironmentVariable("RITHMIC_RAPI_DLL");
if (string.IsNullOrWhiteSpace(rapiDllPath))
    throw new InvalidOperationException("Set RITHMIC_RAPI_DLL to the RAPI+ rapiplus.dll path.");
_ = AssemblyLoadContext.Default.LoadFromAssemblyPath(Path.GetFullPath(rapiDllPath));

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
    public int MaxHistoryMinutes { get; }

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
        CertificatePath = Environment.GetEnvironmentVariable("RITHMIC_CA_FILE");
        MaxHistoryMinutes = int.TryParse(Environment.GetEnvironmentVariable("RITHMIC_MAX_HISTORY_MINUTES"), out var minutes)
            ? Math.Clamp(minutes, 1, 10_000)
            : 2_000;
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
    public override void ExchangeList(ExchangeListInfo info) => CallbackRelay.Dispatch(nameof(ExchangeList), info);
    public override void RefData(RefDataInfo info) => CallbackRelay.Dispatch(nameof(RefData), info);
    public override void TradePrint(TradeInfo info) => CallbackRelay.Dispatch(nameof(TradePrint), info);
    public override void TradeReplay(TradeReplayInfo info) => CallbackRelay.Dispatch(nameof(TradeReplay), info);
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
            Environment.SetEnvironmentVariable("MML_SSL_CLNT_AUTH_FILE", Path.GetFullPath(config.CertificatePath));

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
            default:
                throw new InvalidOperationException($"Unknown Rithmic gateway message: {type}");
        }
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
        var waiter = NewWaiter();
        replayWaiter = waiter;
        try
        {
            var end = (int)DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var start = end - (limit * 60);
            Invoke(engine!, "replayTrades", exchange, symbol, start, end, new object());
            var info = await waiter.Task.WaitAsync(TimeSpan.FromSeconds(90));
            var responseCode = ReadInt(info, "RpCode");
            if (responseCode != 0)
                throw new InvalidOperationException($"Rithmic trade replay rejected {exchange}.{symbol} (code {responseCode}).");
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
            case "RefData":
                referenceDataWaiter?.TrySetResult(info);
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

    private static object? Invoke(object target, string method, params object?[] arguments)
    {
        var methodInfo = target.GetType().GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)
            .Where(candidate => candidate.Name == method && candidate.GetParameters().Length == arguments.Length)
            .SingleOrDefault()
            ?? throw new InvalidOperationException($"RAPI+ method not found: {method}/{arguments.Length}");
        try
        {
            return methodInfo.Invoke(target, arguments);
        }
        catch (TargetInvocationException exception) when (exception.InnerException is not null)
        {
            throw exception.InnerException;
        }
    }

    private TaskCompletionSource<object?> NewWaiter()
        => new(TaskCreationOptions.RunContinuationsAsynchronously);

    private static object? Property(object? target, string property)
        => target?.GetType().GetProperty(property, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)?.GetValue(target);

    private static string? ReadString(object? target, string property)
        => Property(target, property)?.ToString();

    private static string? ReadString(JsonElement element, string property)
        => element.TryGetProperty(property, out var value) && value.ValueKind != JsonValueKind.Null ? value.GetString() : null;

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
