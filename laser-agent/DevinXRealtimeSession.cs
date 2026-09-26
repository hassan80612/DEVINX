using System.Security.Cryptography;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace DevinXLaserAgent;

internal sealed class DevinXRealtimeSession : IAsyncDisposable
{
    private const string PublishableKey="sb_publishable_sZoXI7Qxu35geVcMN1p-4A_d4ojgA8s";
    private static readonly Uri RealtimeBase=
        new($"wss://jubiwhtnhxluetzkzomm.supabase.co/realtime/v1/websocket?apikey={Uri.EscapeDataString(PublishableKey)}&vsn=1.0.0");

    private readonly RemoteSessionConfig _config;
    private readonly Func<RealtimeCommand,Task> _onCommand;
    private readonly Func<RealtimeRemoteInput,Task> _onInput;
    private readonly ClientWebSocket _socket=new();
    private readonly SemaphoreSlim _sendLock=new(1,1);
    private readonly CancellationTokenSource _stop=new();
    private readonly TaskCompletionSource<bool> _joined=new(TaskCreationOptions.RunContinuationsAsynchronously);
    private Task? _receiveTask;
    private Task? _heartbeatTask;
    private long _ref=1;

    public DevinXRealtimeSession(
        RemoteSessionConfig config,
        Func<RealtimeCommand,Task> onCommand,
        Func<RealtimeRemoteInput,Task> onInput)
    {
        _config=config;
        _onCommand=onCommand;
        _onInput=onInput;
    }

    public bool IsConnected=>_socket.State==WebSocketState.Open&&_joined.Task.IsCompletedSuccessfully;
    public string SessionId=>_config.Id;
    public long Revision=>_config.Revision;

    public async Task<bool> ConnectAsync(CancellationToken cancellationToken)
    {
        using var linked=CancellationTokenSource.CreateLinkedTokenSource(cancellationToken,_stop.Token);
        try
        {
            await _socket.ConnectAsync(RealtimeBase,linked.Token);
            _receiveTask=ReceiveLoopAsync(_stop.Token);
            await SendEnvelopeAsync(
                "phx_join",
                new
                {
                    config=new
                    {
                        broadcast=new{ack=false,self=false},
                        presence=new{enabled=false},
                        @private=false
                    }
                },
                joinRef:"1",
                reference:"1",
                linked.Token);

            using var timeout=CancellationTokenSource.CreateLinkedTokenSource(linked.Token);
            timeout.CancelAfter(TimeSpan.FromSeconds(8));
            await _joined.Task.WaitAsync(timeout.Token);
            _heartbeatTask=HeartbeatLoopAsync(_stop.Token);
            return true;
        }
        catch
        {
            return false;
        }
    }

    public async Task SendFrameAsync(CapturedPreview frame,long sequence,CancellationToken cancellationToken)
    {
        if(!IsConnected)return;

        await SendBroadcastAsync("frame",new
        {
            token=_config.FrameToken,
            seq=sequence,
            capturedAt=frame.CapturedAtUtc.ToUnixTimeMilliseconds(),
            width=frame.Width,
            height=frame.Height,
            jpeg=Convert.ToBase64String(frame.Jpeg)
        },cancellationToken);
    }

    public async Task SendAgentStateAsync(string state,CancellationToken cancellationToken)
    {
        if(!IsConnected)return;
        await SendBroadcastAsync("agent_state",new
        {
            token=_config.FrameToken,
            state,
            at=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        },cancellationToken);
    }

    public async Task SendCommandResultAsync(
        string commandId,
        bool ok,
        string? reason,
        CancellationToken cancellationToken)
    {
        if(!IsConnected)return;
        await SendBroadcastAsync("command_result",new
        {
            token=_config.ControlToken,
            commandId,
            ok,
            reason,
            at=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        },cancellationToken);
    }

    private async Task SendBroadcastAsync(string eventName,object payload,CancellationToken cancellationToken)
    {
        await SendEnvelopeAsync(
            "broadcast",
            new{type="broadcast",@event=eventName,payload},
            joinRef:"1",
            reference:Interlocked.Increment(ref _ref).ToString(),
            cancellationToken);
    }

    private async Task SendEnvelopeAsync(
        string eventName,
        object payload,
        string? joinRef,
        string reference,
        CancellationToken cancellationToken)
    {
        if(_socket.State!=WebSocketState.Open)return;
        var message=JsonSerializer.Serialize(new
        {
            topic="realtime:"+_config.Topic,
            @event=eventName,
            payload,
            @ref=reference,
            join_ref=joinRef
        });

        var bytes=Encoding.UTF8.GetBytes(message);
        await _sendLock.WaitAsync(cancellationToken);
        try
        {
            await _socket.SendAsync(
                new ArraySegment<byte>(bytes),
                WebSocketMessageType.Text,
                true,
                cancellationToken);
        }
        finally
        {
            _sendLock.Release();
        }
    }

    private async Task ReceiveLoopAsync(CancellationToken cancellationToken)
    {
        var buffer=new byte[64*1024];
        using var stream=new MemoryStream();

        while(!cancellationToken.IsCancellationRequested&&_socket.State==WebSocketState.Open)
        {
            try
            {
                stream.SetLength(0);
                WebSocketReceiveResult result;
                do
                {
                    result=await _socket.ReceiveAsync(new ArraySegment<byte>(buffer),cancellationToken);
                    if(result.MessageType==WebSocketMessageType.Close)return;
                    stream.Write(buffer,0,result.Count);
                    if(stream.Length>1024*1024)return;
                }
                while(!result.EndOfMessage);

                if(result.MessageType!=WebSocketMessageType.Text)continue;
                var json=Encoding.UTF8.GetString(stream.GetBuffer(),0,(int)stream.Length);
                await HandleMessageAsync(json);
            }
            catch(OperationCanceledException) when(cancellationToken.IsCancellationRequested){return;}
            catch
            {
                return;
            }
        }
    }

    private async Task HandleMessageAsync(string json)
    {
        try
        {
            using var doc=JsonDocument.Parse(json);
            var root=doc.RootElement;
            var eventName=root.TryGetProperty("event",out var ev)?ev.GetString():null;

            if(eventName=="phx_reply")
            {
                var reference=root.TryGetProperty("ref",out var rf)?rf.GetString():null;
                if(reference=="1"
                   &&root.TryGetProperty("payload",out var reply)
                   &&reply.TryGetProperty("status",out var status)
                   &&status.GetString()=="ok")
                    _joined.TrySetResult(true);
                return;
            }

            if(eventName!="broadcast"
               ||!root.TryGetProperty("payload",out var broadcast)
               ||broadcast.ValueKind!=JsonValueKind.Object)
                return;

            var userEvent=broadcast.TryGetProperty("event",out var userEv)?userEv.GetString():null;
            if(!broadcast.TryGetProperty("payload",out var payload)
               ||payload.ValueKind!=JsonValueKind.Object)
                return;

            if(userEvent=="command")
            {
                var token=payload.TryGetProperty("token",out var tokenEl)?tokenEl.GetString():"";
                if(!CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(token??""),
                    Encoding.UTF8.GetBytes(_config.ControlToken)))
                    return;

                var id=payload.TryGetProperty("commandId",out var idEl)?idEl.GetString():null;
                var command=payload.TryGetProperty("command",out var cmdEl)?cmdEl.GetString():null;
                DateTimeOffset? expires=null;
                if(payload.TryGetProperty("expiresAt",out var expEl)
                   &&expEl.ValueKind==JsonValueKind.String
                   &&DateTimeOffset.TryParse(expEl.GetString(),out var parsed))
                    expires=parsed;

                if(!string.IsNullOrWhiteSpace(id)&&!string.IsNullOrWhiteSpace(command))
                    _=Task.Run(()=>_onCommand(new RealtimeCommand(token??"",id!,command!,expires)));
                return;
            }

            if(userEvent=="remote_input")
            {
                if(!_config.RemoteInputEnabled||string.IsNullOrWhiteSpace(_config.InputToken))return;
                var token=payload.TryGetProperty("token",out var tokenEl)?tokenEl.GetString():"";
                if(!CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(token??""),
                    Encoding.UTF8.GetBytes(_config.InputToken!)))
                    return;

                static double? Number(JsonElement p,string name)=>
                    p.TryGetProperty(name,out var e)&&e.TryGetDouble(out var v)?v:null;
                static bool Bool(JsonElement p,string name)=>
                    p.TryGetProperty(name,out var e)&&e.ValueKind==JsonValueKind.True;
                static string? String(JsonElement p,string name)=>
                    p.TryGetProperty(name,out var e)&&e.ValueKind==JsonValueKind.String?e.GetString():null;

                await _onInput(new RealtimeRemoteInput(
                    token??"",
                    String(payload,"type")??"",
                    Number(payload,"x"),
                    Number(payload,"y"),
                    payload.TryGetProperty("button",out var b)&&b.TryGetInt32(out var bv)?bv:0,
                    Number(payload,"deltaY")??0,
                    String(payload,"key"),
                    String(payload,"code"),
                    Bool(payload,"ctrl"),
                    Bool(payload,"shift"),
                    Bool(payload,"alt"),
                    Bool(payload,"meta")));
            }
        }
        catch
        {
            // Malformed or unrelated Realtime messages are ignored.
        }
    }

    private async Task HeartbeatLoopAsync(CancellationToken cancellationToken)
    {
        while(!cancellationToken.IsCancellationRequested&&_socket.State==WebSocketState.Open)
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(25),cancellationToken);
                if(cancellationToken.IsCancellationRequested)return;
                var message=JsonSerializer.Serialize(new
                {
                    topic="phoenix",
                    @event="heartbeat",
                    payload=new{},
                    @ref=Interlocked.Increment(ref _ref).ToString(),
                    join_ref=(string?)null
                });
                var bytes=Encoding.UTF8.GetBytes(message);
                await _sendLock.WaitAsync(cancellationToken);
                try
                {
                    await _socket.SendAsync(
                        new ArraySegment<byte>(bytes),
                        WebSocketMessageType.Text,true,cancellationToken);
                }
                finally{_sendLock.Release();}
            }
            catch(OperationCanceledException) when(cancellationToken.IsCancellationRequested){return;}
            catch{return;}
        }
    }

    public async ValueTask DisposeAsync()
    {
        _stop.Cancel();
        try
        {
            if(_socket.State==WebSocketState.Open)
                await _socket.CloseAsync(WebSocketCloseStatus.NormalClosure,"session ended",CancellationToken.None);
        }
        catch{}
        try{if(_receiveTask is not null)await _receiveTask;}catch{}
        try{if(_heartbeatTask is not null)await _heartbeatTask;}catch{}
        _socket.Dispose();
        _sendLock.Dispose();
        _stop.Dispose();
    }
}
