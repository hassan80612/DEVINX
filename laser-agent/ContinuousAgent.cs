using System.Security.Cryptography;

namespace DevinXLaserAgent;

internal sealed class ContinuousAgent
{
    private static readonly TimeSpan NormalSampleInterval=TimeSpan.FromSeconds(5);
    private static readonly TimeSpan PreviewSampleInterval=TimeSpan.FromMilliseconds(700);
    private static readonly TimeSpan OnlineKeepAliveInterval=TimeSpan.FromSeconds(5);
    private static readonly TimeSpan OfflineKeepAliveInterval=TimeSpan.FromSeconds(30);
    private static readonly TimeSpan RetryInterval=TimeSpan.FromSeconds(10);
    private static readonly TimeSpan UnchangedPreviewRefresh=TimeSpan.FromSeconds(5);
    private static readonly TimeSpan TelemetryRefreshInterval=TimeSpan.FromSeconds(5);

    private readonly AgentIdentity _identity;
    private readonly TrayHost _tray;
    private readonly SemaphoreSlim _refreshSignal=new(0,1);
    private int _armRequest;

    public ContinuousAgent(AgentIdentity identity,TrayHost tray)
    {
        _identity=identity;
        _tray=tray;
        _tray.RefreshRequested+=RequestRefresh;
        _tray.ControlArmRequested+=OnControlArmRequested;
    }

    private void RequestRefresh()
    {
        try
        {
            if(_refreshSignal.CurrentCount==0)_refreshSignal.Release();
        }
        catch { }
    }

    private void OnControlArmRequested(bool enabled)
    {
        Interlocked.Exchange(ref _armRequest,enabled?1:2);
        RequestRefresh();
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        AgentTelemetry telemetry=AgentTelemetryFactory.Offline(_identity);
        AgentTelemetry? lastSent=null;
        var lastTelemetryCapture=DateTimeOffset.MinValue;
        var nextAllowedAttempt=DateTimeOffset.MinValue;
        var nextKeepAlive=DateTimeOffset.MinValue;

        var previewActive=false;
        var touchEnabled=false;
        DateTimeOffset? previewUntil=null;
        string? lastPreviewHash=null;
        var lastPreviewUpload=DateTimeOffset.MinValue;
        var forcePreviewFrame=false;
        long lastTouchEventSeq=0;

        using var rest=new LightBurnRestClient();
        using var heartbeat=new DevinXHeartbeatClient();
        using var previewClient=new DevinXPreviewClient();
        using var controlClient=new DevinXPreviewControlClient();
        var udp=new LightBurnUdpClient();

        while(!cancellationToken.IsCancellationRequested)
        {
            var now=DateTimeOffset.UtcNow;

            var armRequest=Interlocked.Exchange(ref _armRequest,0);
            if(armRequest!=0)
            {
                try
                {
                    var enabled=armRequest==1;
                    var arm=await controlClient.SetLocalArmAsync(_identity,enabled,cancellationToken);
                    if(arm.Ok)
                    {
                        _tray.ShowInfo(
                            "DevinX Laser Agent",
                            enabled
                                ?"Controle por toque permitido por 5 minutos."
                                :"Controle por toque bloqueado.");
                    }
                    else
                    {
                        _tray.ShowInfo("DevinX Laser Agent","Não foi possível alterar a permissão de toque.");
                    }
                }
                catch
                {
                    _tray.ShowInfo("DevinX Laser Agent","Falha de rede ao alterar a permissão de toque.");
                }
            }

            if(now-lastTelemetryCapture>=TelemetryRefreshInterval)
            {
                try
                {
                    telemetry=await CaptureTelemetryAsync(rest,udp,cancellationToken);
                }
                catch(OperationCanceledException) when(cancellationToken.IsCancellationRequested)
                {
                    break;
                }
                catch
                {
                    telemetry=AgentTelemetryFactory.Offline(_identity);
                }
                lastTelemetryCapture=DateTimeOffset.UtcNow;
            }

            if(previewUntil.HasValue&&previewUntil<=now)
            {
                previewActive=false;
                touchEnabled=false;
            }

            _tray.SetStatus(Describe(telemetry,previewActive,touchEnabled));

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
                        nextAllowedAttempt=acceptedAt.AddSeconds(2);
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

            if(previewActive)
            {
                try
                {
                    var control=await controlClient.PollAsync(_identity,lastTouchEventSeq,cancellationToken);
                    if(control is not null)
                    {
                        previewActive=control.PreviewActive;
                        touchEnabled=control.TouchEnabled;

                        if(control.EventSeq>lastTouchEventSeq)
                        {
                            lastTouchEventSeq=control.EventSeq;
                            if(touchEnabled
                               && control.TouchEventType=="tap"
                               && control.TouchX.HasValue
                               && control.TouchY.HasValue
                               && LightBurnWindowCapture.TryTap(control.TouchX.Value,control.TouchY.Value))
                            {
                                forcePreviewFrame=true;
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
                    // Control is optional; preview and telemetry continue.
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
                                touchEnabled=false;
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

    private async Task<AgentTelemetry> CaptureTelemetryAsync(
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

    private static string Describe(AgentTelemetry telemetry,bool previewActive,bool touchEnabled)
    {
        if(!telemetry.LightBurnOnline)return "DevinX Laser Agent — LightBurn offline";
        if(previewActive&&touchEnabled)return "DevinX Laser Agent — toque remoto ativo";
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
