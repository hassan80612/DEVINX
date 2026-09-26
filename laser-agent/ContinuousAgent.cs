namespace DevinXLaserAgent;

internal sealed class ContinuousAgent
{
    private static readonly TimeSpan SampleInterval = TimeSpan.FromSeconds(15);
    private static readonly TimeSpan KeepAliveInterval = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan RetryInterval = TimeSpan.FromSeconds(30);

    private readonly AgentIdentity _identity;
    private readonly TrayHost _tray;
    private readonly SemaphoreSlim _refreshSignal = new(0,1);

    public ContinuousAgent(AgentIdentity identity, TrayHost tray)
    {
        _identity = identity;
        _tray = tray;
        _tray.RefreshRequested += RequestRefresh;
    }

    private void RequestRefresh()
    {
        try
        {
            if (_refreshSignal.CurrentCount == 0) _refreshSignal.Release();
        }
        catch { }
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        AgentTelemetry? lastSent = null;
        var nextNetworkSend = DateTimeOffset.MinValue;

        using var rest = new LightBurnRestClient();
        using var heartbeat = new DevinXHeartbeatClient();
        var udp = new LightBurnUdpClient();

        while (!cancellationToken.IsCancellationRequested)
        {
            AgentTelemetry telemetry;
            try
            {
                telemetry = await CaptureAsync(rest, udp, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch
            {
                telemetry = AgentTelemetryFactory.Offline(_identity);
            }

            _tray.SetStatus(Describe(telemetry));

            var changed = lastSent is null || MeaningfullyDifferent(lastSent, telemetry);
            var now = DateTimeOffset.UtcNow;

            if (changed || now >= nextNetworkSend)
            {
                try
                {
                    var result = await heartbeat.SendAsync(_identity, telemetry, cancellationToken);
                    if (result.Accepted)
                    {
                        lastSent = telemetry;
                        nextNetworkSend = DateTimeOffset.UtcNow.Add(KeepAliveInterval);
                    }
                    else
                    {
                        _tray.SetStatus("DevinX Laser Agent — vínculo recusado");
                        nextNetworkSend = DateTimeOffset.UtcNow.Add(RetryInterval);
                    }
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    break;
                }
                catch
                {
                    _tray.SetStatus("DevinX Laser Agent — sem conexão");
                    nextNetworkSend = DateTimeOffset.UtcNow.Add(RetryInterval);
                }
            }

            try
            {
                var delay = Task.Delay(SampleInterval, cancellationToken);
                var refresh = _refreshSignal.WaitAsync(cancellationToken);
                await Task.WhenAny(delay, refresh);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
        }
    }

    private async Task<AgentTelemetry> CaptureAsync(
        LightBurnRestClient rest,
        LightBurnUdpClient udp,
        CancellationToken cancellationToken)
    {
        if (await rest.IsAvailableAsync(cancellationToken))
        {
            var secret = SecureSecretStore.Load();
            if (!string.IsNullOrWhiteSpace(secret))
            {
                var status = await rest.GetStatusJsonAsync(secret, cancellationToken);
                if (status is not null)
                {
                    var project = await rest.GetProjectJsonAsync(secret, cancellationToken);
                    var poll = await rest.GetPollSnapshotJsonAsync(secret, cancellationToken);
                    return AgentTelemetryFactory.FromRest(_identity, status, project, poll);
                }
            }
        }

        var ping = await udp.PingAsync(cancellationToken);
        if (!ping.Received)
            return AgentTelemetryFactory.Offline(_identity);

        var statusReply = await udp.StatusAsync(cancellationToken);
        return AgentTelemetryFactory.FromLegacyUdp(_identity, ping, statusReply);
    }

    private static bool MeaningfullyDifferent(AgentTelemetry a, AgentTelemetry b) =>
        a.Adapter != b.Adapter
        || a.LightBurnOnline != b.LightBurnOnline
        || a.DeviceConnected != b.DeviceConnected
        || a.DeviceName != b.DeviceName
        || a.JobState != b.JobState
        || a.Progress != b.Progress
        || a.ProjectFile != b.ProjectFile;

    private static string Describe(AgentTelemetry telemetry)
    {
        if (!telemetry.LightBurnOnline)
            return "DevinX Laser Agent — LightBurn offline";

        return telemetry.JobState switch
        {
            "running" => "DevinX Laser Agent — gravando",
            "paused" => "DevinX Laser Agent — pausado",
            "idle" => "DevinX Laser Agent — LightBurn pronto",
            _ => "DevinX Laser Agent — LightBurn conectado"
        };
    }
}
