using System.Security.Cryptography;

namespace DevinXLaserAgent;

internal sealed class ContinuousAgent
{
    private static readonly TimeSpan NormalSampleInterval=TimeSpan.FromSeconds(3);
    private static readonly TimeSpan PreviewSampleInterval=TimeSpan.FromMilliseconds(350);
    private static readonly TimeSpan OnlineKeepAliveInterval=TimeSpan.FromSeconds(3);
    private static readonly TimeSpan OfflineKeepAliveInterval=TimeSpan.FromSeconds(15);
    private static readonly TimeSpan RetryInterval=TimeSpan.FromSeconds(8);
    private static readonly TimeSpan UnchangedPreviewRefresh=TimeSpan.FromSeconds(2);
    private static readonly TimeSpan TelemetryRefreshInterval=TimeSpan.FromSeconds(3);

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
        using var linked=CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var commandTask=RunCommandLoopAsync(linked.Token);
        try
        {
            await RunTelemetryAndPreviewLoopAsync(linked.Token);
        }
        finally
        {
            linked.Cancel();
            try{await commandTask;}catch(OperationCanceledException){}
        }
    }

    private async Task RunCommandLoopAsync(CancellationToken cancellationToken)
    {
        using var commandClient=new DevinXCommandClient();
        var udp=new LightBurnUdpClient();
        DateTimeOffset? armedUntil=null;

        while(!cancellationToken.IsCancellationRequested)
        {
            var armRequest=Interlocked.Exchange(ref _armRequest,0);
            if(armRequest!=0)
            {
                try
                {
                    var enabled=armRequest==1;
                    var arm=await commandClient.SetRemoteArmAsync(_identity,enabled,cancellationToken);
                    if(arm.Ok)
                    {
                        armedUntil=enabled?arm.LocalArmUntil:null;
                        _tray.ShowInfo(
                            "DevinX Laser Agent",
                            enabled
                                ?"Controles remotos liberados por 5 minutos."
                                :"Controles remotos bloqueados.");
                    }
                    else
                    {
                        _tray.ShowInfo("DevinX Laser Agent","Não foi possível alterar a permissão dos controles.");
                    }
                }
                catch(OperationCanceledException) when(cancellationToken.IsCancellationRequested){break;}
                catch
                {
                    _tray.ShowInfo("DevinX Laser Agent","Falha de rede ao alterar a permissão dos controles.");
                }
            }

            var armed=armedUntil.HasValue&&armedUntil>DateTimeOffset.UtcNow;
            if(armed)
            {
                try
                {
                    var command=await commandClient.PollAsync(_identity,cancellationToken);
                    if(command is not null)
                    {
                        if(command.ExpiresAt.HasValue&&command.ExpiresAt<=DateTimeOffset.UtcNow)
                        {
                            await commandClient.AckAsync(_identity,command.Id,false,"command_expired",cancellationToken);
                        }
                        else
                        {
                            var result=await LightBurnCommandExecutor.ExecuteAsync(command.Type,udp,cancellationToken);
                            await commandClient.AckAsync(_identity,command.Id,result.Ok,result.Reason,cancellationToken);
                            RequestRefresh();
                        }
                    }
                }
                catch(OperationCanceledException) when(cancellationToken.IsCancellationRequested){break;}
                catch
                {
                    // Keep the Agent alive; next poll retries automatically.
                }
            }

            try
            {
                await Task.Delay(armed?300:1200,cancellationToken);
            }
            catch(OperationCanceledException) when(cancellationToken.IsCancellationRequested){break;}
        }
    }

    private async Task RunTelemetryAndPreviewLoopAsync(CancellationToken cancellationToken)
    {
        AgentTelemetry telemetry=AgentTelemetryFactory.Offline(_identity);
        AgentTelemetry? lastSent=null;
        var lastTelemetryCapture=DateTimeOffset.MinValue;
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
            var now=DateTimeOffset.UtcNow;

            if(now-lastTelemetryCapture>=TelemetryRefreshInterval)
            {
                try
                {
                    telemetry=await CaptureTelemetryAsync(rest,udp,cancellationToken);
                }
                catch(OperationCanceledException) when(cancellationToken.IsCancellationRequested){break;}
                catch
                {
                    telemetry=AgentTelemetryFactory.Offline(_identity);
                }
                lastTelemetryCapture=DateTimeOffset.UtcNow;
            }

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
                        nextAllowedAttempt=acceptedAt.AddSeconds(1);
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
                        nextAllowedAttempt=DateTimeOffset.UtcNow.Add(RetryInterval);
                    }
                }
                catch(OperationCanceledException) when(cancellationToken.IsCancellationRequested){break;}
                catch
                {
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
                catch(OperationCanceledException) when(cancellationToken.IsCancellationRequested){break;}
                catch
                {
                    // Preview is optional; telemetry stays alive.
                }
            }

            try
            {
                await _refreshSignal.WaitAsync(previewActive?PreviewSampleInterval:NormalSampleInterval,cancellationToken);
            }
            catch(OperationCanceledException) when(cancellationToken.IsCancellationRequested){break;}
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
