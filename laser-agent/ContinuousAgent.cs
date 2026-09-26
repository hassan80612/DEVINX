using System.Security.Cryptography;

namespace DevinXLaserAgent;

internal sealed class ContinuousAgent
{
    private static readonly TimeSpan NormalSampleInterval=TimeSpan.FromSeconds(15);
    private static readonly TimeSpan PreviewSampleInterval=TimeSpan.FromSeconds(3);
    private static readonly TimeSpan OnlineKeepAliveInterval=TimeSpan.FromSeconds(20);
    private static readonly TimeSpan OfflineKeepAliveInterval=TimeSpan.FromSeconds(60);
    private static readonly TimeSpan RetryInterval=TimeSpan.FromSeconds(30);
    private static readonly TimeSpan UnchangedPreviewRefresh=TimeSpan.FromSeconds(30);

    private readonly AgentIdentity _identity;
    private readonly TrayHost _tray;
    private readonly SemaphoreSlim _refreshSignal=new(0,1);

    public ContinuousAgent(AgentIdentity identity,TrayHost tray)
    {
        _identity=identity;
        _tray=tray;
        _tray.RefreshRequested+=RequestRefresh;
    }

    private void RequestRefresh()
    {
        try
        {
            if(_refreshSignal.CurrentCount==0)_refreshSignal.Release();
        }
        catch { }
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        AgentTelemetry? lastSent=null;
        var nextAllowedAttempt=DateTimeOffset.MinValue;
        var nextKeepAlive=DateTimeOffset.MinValue;

        var previewActive=false;
        DateTimeOffset? previewUntil=null;
        string? lastPreviewHash=null;
        var lastPreviewUpload=DateTimeOffset.MinValue;
        var forcePreviewFrame=false;

        using var rest=new LightBurnRestClient();
        using var heartbeat=new DevinXHeartbeatClient();
        using var previewClient=new DevinXPreviewClient();
        var udp=new LightBurnUdpClient();

        while(!cancellationToken.IsCancellationRequested)
        {
            AgentTelemetry telemetry;
            try
            {
                telemetry=await CaptureAsync(rest,udp,cancellationToken);
            }
            catch(OperationCanceledException) when(cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch
            {
                telemetry=AgentTelemetryFactory.Offline(_identity);
            }

            var now=DateTimeOffset.UtcNow;
            if(previewUntil.HasValue&&previewUntil<=now)previewActive=false;

            _tray.SetStatus(Describe(telemetry,previewActive));

            var changed=lastSent is null||MeaningfullyDifferent(lastSent,telemetry);
            if(now>=nextAllowedAttempt&&(changed||now>=nextKeepAlive))
            {
                try
                {
                    var result=await heartbeat.SendAsync(_identity,telemetry,cancellationToken);
                    if(result.Accepted)
                    {
                        var acceptedAt=DateTimeOffset.UtcNow;
                        lastSent=telemetry;
                        nextAllowedAttempt=acceptedAt.AddSeconds(5);
                        nextKeepAlive=acceptedAt.Add(
                            telemetry.LightBurnOnline?OnlineKeepAliveInterval:OfflineKeepAliveInterval);

                        var wasPreviewActive=previewActive;
                        previewActive=result.PreviewActive
                            &&(!result.PreviewUntil.HasValue||result.PreviewUntil>acceptedAt);
                        previewUntil=result.PreviewUntil;
                        if(previewActive&&!wasPreviewActive)forcePreviewFrame=true;
                    }
                    else
                    {
                        _tray.SetStatus("DevinX Laser Agent — vínculo recusado");
                        nextAllowedAttempt=DateTimeOffset.UtcNow.Add(RetryInterval);
                    }
                }
                catch(OperationCanceledException) when(cancellationToken.IsCancellationRequested)
                {
                    break;
                }
                catch
                {
                    _tray.SetStatus("DevinX Laser Agent — sem conexão");
                    nextAllowedAttempt=DateTimeOffset.UtcNow.Add(RetryInterval);
                }
            }

            if(previewActive&&telemetry.LightBurnOnline)
            {
                try
                {
                    var frame=LightBurnWindowCapture.TryCapture();
                    if(frame is not null)
                    {
                        var hash=Convert.ToHexString(SHA256.HashData(frame.Jpeg));
                        var shouldUpload=forcePreviewFrame
                            ||!string.Equals(lastPreviewHash,hash,StringComparison.Ordinal)
                            ||DateTimeOffset.UtcNow-lastPreviewUpload>=UnchangedPreviewRefresh;

                        if(shouldUpload)
                        {
                            var uploaded=await previewClient.UploadAsync(_identity,frame,cancellationToken);
                            if(uploaded.Accepted)
                            {
                                lastPreviewHash=hash;
                                lastPreviewUpload=DateTimeOffset.UtcNow;
                                forcePreviewFrame=false;
                            }
                            else if(uploaded.Reason=="preview_not_requested")
                            {
                                previewActive=false;
                                previewUntil=null;
                            }
                        }
                    }
                }
                catch(OperationCanceledException) when(cancellationToken.IsCancellationRequested)
                {
                    break;
                }
                catch
                {
                    // Preview is optional. Telemetry continues even if screen capture fails.
                }
            }

            try
            {
                var interval=previewActive?PreviewSampleInterval:NormalSampleInterval;
                await _refreshSignal.WaitAsync(interval,cancellationToken);
            }
            catch(OperationCanceledException) when(cancellationToken.IsCancellationRequested)
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
        if(await rest.IsAvailableAsync(cancellationToken))
        {
            var secret=SecureSecretStore.Load();
            if(!string.IsNullOrWhiteSpace(secret))
            {
                var status=await rest.GetStatusJsonAsync(secret,cancellationToken);
                if(status is not null)
                {
                    var project=await rest.GetProjectJsonAsync(secret,cancellationToken);
                    var poll=await rest.GetPollSnapshotJsonAsync(secret,cancellationToken);
                    return AgentTelemetryFactory.FromRest(_identity,status,project,poll);
                }
            }
        }

        var ping=await udp.PingAsync(cancellationToken);
        if(!ping.Received)return AgentTelemetryFactory.Offline(_identity);

        var statusReply=await udp.StatusAsync(cancellationToken);
        return AgentTelemetryFactory.FromLegacyUdp(_identity,ping,statusReply);
    }

    private static bool MeaningfullyDifferent(AgentTelemetry a,AgentTelemetry b)=>
        a.Adapter!=b.Adapter
        ||a.LightBurnOnline!=b.LightBurnOnline
        ||a.DeviceConnected!=b.DeviceConnected
        ||a.DeviceName!=b.DeviceName
        ||a.JobState!=b.JobState
        ||a.Progress!=b.Progress
        ||a.ProjectFile!=b.ProjectFile;

    private static string Describe(AgentTelemetry telemetry,bool previewActive)
    {
        if(!telemetry.LightBurnOnline)return "DevinX Laser Agent — LightBurn offline";
        if(previewActive)return "DevinX Laser Agent — visualização ativa";

        return telemetry.JobState switch
        {
            "running"=>"DevinX Laser Agent — gravando",
            "paused"=>"DevinX Laser Agent — pausado",
            "idle"=>"DevinX Laser Agent — LightBurn pronto",
            _=>"DevinX Laser Agent — LightBurn conectado"
        };
    }
}
