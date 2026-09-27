using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace DevinXLaserAgent;

internal sealed class ContinuousAgent
{
    private static readonly TimeSpan TelemetryInterval=TimeSpan.FromSeconds(3);
    private static readonly TimeSpan OnlineKeepAlive=TimeSpan.FromSeconds(10);
    private static readonly TimeSpan OfflineKeepAlive=TimeSpan.FromSeconds(30);
    private static readonly TimeSpan FrameInterval=TimeSpan.FromMilliseconds(250);
    private static readonly TimeSpan UnchangedFrameKeepAlive=TimeSpan.FromSeconds(3);

    private readonly AgentIdentity _identity;
    private readonly TrayHost _tray;
    private readonly SemaphoreSlim _refreshSignal=new(0,1);
    private readonly ConcurrentDictionary<string,DateTimeOffset> _seenCommands=new();

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
        catch{}
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        using var linked=CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var telemetryTask=RunTelemetryLoopAsync(linked.Token);
        var remoteTask=RunRemoteLoopAsync(linked.Token);

        try{await Task.WhenAll(telemetryTask,remoteTask);}
        finally{linked.Cancel();}
    }

    private async Task RunRemoteLoopAsync(CancellationToken cancellationToken)
    {
        using var commandClient=new DevinXCommandClient();
        var udp=new LightBurnUdpClient();

        RemoteSessionConfig? current=null;
        DevinXRealtimeSession? realtime=null;
        CancellationTokenSource? frameCts=null;
        Task? frameTask=null;

        async Task StopRealtimeAsync()
        {
            if(frameCts is not null)
            {
                frameCts.Cancel();
                try{if(frameTask is not null)await frameTask;}catch(OperationCanceledException){}
                frameCts.Dispose();
                frameCts=null;
                frameTask=null;
            }
            if(realtime is not null)
            {
                await realtime.DisposeAsync();
                realtime=null;
            }
        }

        async Task ExecuteOnceAsync(RemoteCommand command)
        {
            if(!_seenCommands.TryAdd(command.Id,DateTimeOffset.UtcNow))return;
            CleanupSeenCommands();

            if(command.ExpiresAt.HasValue&&command.ExpiresAt<=DateTimeOffset.UtcNow)
            {
                await commandClient.AckAsync(_identity,command.Id,false,"command_expired",cancellationToken);
                return;
            }

            CommandExecutionResult result;
            try
            {
                result=await LightBurnCommandExecutor.ExecuteAsync(command.Type,udp,cancellationToken);
            }
            catch(Exception ex)
            {
                result=new CommandExecutionResult(false,"agent_error:"+ex.GetType().Name);
            }

            await commandClient.AckAsync(_identity,command.Id,result.Ok,result.Reason,cancellationToken);
            RequestRefresh();
        }

        async Task HandleRealtimeCommandAsync(RealtimeCommand command)
        {
            await ExecuteOnceAsync(new RemoteCommand(command.CommandId,command.Command,command.ExpiresAt));
        }

        Task HandleRemoteInputAsync(RealtimeRemoteInput input)
        {
            LightBurnRemoteInput.Apply(input);
            return Task.CompletedTask;
        }

        while(!cancellationToken.IsCancellationRequested)
        {
            AgentPollResult poll;
            try
            {
                poll=await commandClient.PollAsync(
                    _identity,current?.Id,current?.Revision??0,cancellationToken);
            }
            catch(OperationCanceledException) when(cancellationToken.IsCancellationRequested){break;}
            catch
            {
                await DelaySafe(TimeSpan.FromSeconds(2),cancellationToken);
                continue;
            }

            if(!poll.Ok)
            {
                await DelaySafe(TimeSpan.FromSeconds(2),cancellationToken);
                continue;
            }

            if(poll.Command is not null)
            {
                try{await ExecuteOnceAsync(poll.Command);}
                catch(OperationCanceledException) when(cancellationToken.IsCancellationRequested){break;}
                catch{}
            }

            var sessionChanged=
                (current is null)!=(poll.Session is null)
                ||(current is not null&&poll.Session is not null
                    &&(current.Id!=poll.Session.Id||current.Revision!=poll.Session.Revision));

            if(sessionChanged)
            {
                await StopRealtimeAsync();
                current=poll.Session;

                if(current is not null)
                {
                    realtime=new DevinXRealtimeSession(
                        current,
                        HandleRealtimeCommandAsync,
                        HandleRemoteInputAsync);

                    var connected=await realtime.ConnectAsync(cancellationToken);
                    if(connected)
                    {
                        _tray.SetStatus(current.RemoteInputEnabled
                            ?"DevinX Laser Agent — controle remoto ativo"
                            :"DevinX Laser Agent — transmissão ao vivo");
                        await realtime.SendAgentStateAsync(
                            current.RemoteInputEnabled?"control-ready":"preview-ready",
                            cancellationToken);

                        frameCts=CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                        frameTask=RunFrameLoopAsync(realtime,frameCts.Token);
                    }
                    else
                    {
                        _tray.SetStatus("DevinX Laser Agent — Realtime indisponível ("+(realtime.LastError??"erro")+")");
                        await realtime.DisposeAsync();
                        realtime=null;
                    }
                }
            }
            else if(current is not null&&(realtime is null||!realtime.IsConnected))
            {
                await StopRealtimeAsync();
                realtime=new DevinXRealtimeSession(current,HandleRealtimeCommandAsync,HandleRemoteInputAsync);
                if(await realtime.ConnectAsync(cancellationToken))
                {
                    frameCts=CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                    frameTask=RunFrameLoopAsync(realtime,frameCts.Token);
                }
                else
                {
                    _tray.SetStatus("DevinX Laser Agent — Realtime indisponível ("+(realtime.LastError??"erro")+")");
                    await realtime.DisposeAsync();
                    realtime=null;
                }
            }
        }

        await StopRealtimeAsync();
    }

    private async Task RunFrameLoopAsync(
        DevinXRealtimeSession realtime,
        CancellationToken cancellationToken)
    {
        string? lastHash=null;
        var lastSent=DateTimeOffset.MinValue;
        long sequence=0;

        while(!cancellationToken.IsCancellationRequested&&realtime.IsConnected)
        {
            try
            {
                var frame=LightBurnWindowCapture.TryCapture();
                if(frame is not null)
                {
                    var hash=Convert.ToHexString(SHA256.HashData(frame.Jpeg));
                    var changed=!string.Equals(lastHash,hash,StringComparison.Ordinal);
                    var keepAlive=DateTimeOffset.UtcNow-lastSent>=UnchangedFrameKeepAlive;

                    if(changed||keepAlive)
                    {
                        await realtime.SendFrameAsync(frame,Interlocked.Increment(ref sequence),cancellationToken);
                        lastHash=hash;
                        lastSent=DateTimeOffset.UtcNow;
                    }
                }
            }
            catch(OperationCanceledException) when(cancellationToken.IsCancellationRequested){break;}
            catch
            {
                // Realtime reconnect is handled by the session loop.
            }

            await DelaySafe(FrameInterval,cancellationToken);
        }
    }

    private async Task RunTelemetryLoopAsync(CancellationToken cancellationToken)
    {
        AgentTelemetry? lastSent=null;
        var nextCapture=DateTimeOffset.MinValue;
        var nextKeepAlive=DateTimeOffset.MinValue;
        AgentTelemetry telemetry=AgentTelemetryFactory.Offline(_identity);

        using var rest=new LightBurnRestClient();
        using var heartbeat=new DevinXHeartbeatClient();
        var udp=new LightBurnUdpClient();

        while(!cancellationToken.IsCancellationRequested)
        {
            var now=DateTimeOffset.UtcNow;
            if(now>=nextCapture)
            {
                try{telemetry=await CaptureTelemetryAsync(rest,udp,cancellationToken);}
                catch(OperationCanceledException) when(cancellationToken.IsCancellationRequested){break;}
                catch{telemetry=AgentTelemetryFactory.Offline(_identity);}
                nextCapture=DateTimeOffset.UtcNow+TelemetryInterval;
            }

            _tray.SetStatus(Describe(telemetry));

            var changed=lastSent is null||MeaningfullyDifferent(lastSent,telemetry);
            if(changed||DateTimeOffset.UtcNow>=nextKeepAlive)
            {
                try
                {
                    var result=await heartbeat.SendAsync(_identity,telemetry,cancellationToken);
                    if(result.Accepted)
                    {
                        lastSent=telemetry;
                        nextKeepAlive=DateTimeOffset.UtcNow+
                            (telemetry.LightBurnOnline?OnlineKeepAlive:OfflineKeepAlive);
                    }
                    else
                    {
                        nextKeepAlive=DateTimeOffset.UtcNow+TimeSpan.FromSeconds(8);
                    }
                }
                catch(OperationCanceledException) when(cancellationToken.IsCancellationRequested){break;}
                catch
                {
                    nextKeepAlive=DateTimeOffset.UtcNow+TimeSpan.FromSeconds(8);
                }
            }

            try{await _refreshSignal.WaitAsync(TimeSpan.FromSeconds(1),cancellationToken);}
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
        return AgentTelemetryFactory.FromLegacyUdp(
            _identity,ping,await udp.StatusAsync(cancellationToken));
    }

    private void CleanupSeenCommands()
    {
        var cutoff=DateTimeOffset.UtcNow-TimeSpan.FromMinutes(5);
        foreach(var pair in _seenCommands)
            if(pair.Value<cutoff)_seenCommands.TryRemove(pair.Key,out _);
    }

    private static bool MeaningfullyDifferent(AgentTelemetry a,AgentTelemetry b)=>
        a.Adapter!=b.Adapter
        ||a.LightBurnOnline!=b.LightBurnOnline
        ||a.DeviceConnected!=b.DeviceConnected
        ||a.DeviceName!=b.DeviceName
        ||a.JobState!=b.JobState
        ||a.Progress!=b.Progress
        ||a.ProjectFile!=b.ProjectFile;

    private static string Describe(AgentTelemetry telemetry)
    {
        if(!telemetry.LightBurnOnline)return "DevinX Laser Agent — LightBurn offline";
        return telemetry.JobState switch
        {
            "running"=>"DevinX Laser Agent — gravando",
            "paused"=>"DevinX Laser Agent — pausado",
            "idle"=>"DevinX Laser Agent — LightBurn pronto",
            _=>"DevinX Laser Agent — LightBurn conectado"
        };
    }

    private static async Task DelaySafe(TimeSpan delay,CancellationToken token)
    {
        try{await Task.Delay(delay,token);}
        catch(OperationCanceledException) when(token.IsCancellationRequested){}
    }
}
