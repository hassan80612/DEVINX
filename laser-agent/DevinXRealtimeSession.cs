using System.Security.Cryptography;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace DevinXLaserAgent;

internal sealed class DevinXRealtimeSession : IAsyncDisposable
{
    private const string PublishableKey="sb_publishable_sZoXI7Qxu35geVcMN1p-4A_d4ojgA8s";
    private static readonly Uri RealtimeBase=
        new($"wss://jubiwhtnhxluetzkzomm.supabase.co/realtime/v1/websocket?apikey={Uri.EscapeDataString(PublishableKey)}&vsn=2.0.0&log_level=info");

    private readonly RemoteSessionConfig _config;
    private readonly object _accessSync=new();
    private bool _remoteInputEnabled;
    private string? _inputToken;
    private long _revision;
    private readonly Func<RealtimeCommand,Task> _onCommand;
    private readonly Func<RealtimeRemoteInput,Task> _onInput;
    private readonly Func<RealtimeControlRequest,Task>? _onControl;
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
        Func<RealtimeRemoteInput,Task> onInput,
        Func<RealtimeControlRequest,Task>? onControl=null)
    {
        _config=config;
        _remoteInputEnabled=config.RemoteInputEnabled;
        _inputToken=config.InputToken;
        _revision=config.Revision;
        _onCommand=onCommand;
        _onInput=onInput;
        _onControl=onControl;
    }

    public bool IsConnected=>_socket.State==WebSocketState.Open&&_joined.Task.IsCompletedSuccessfully;
    public string SessionId=>_config.Id;
    public long Revision{get{lock(_accessSync)return _revision;}}
    public string? LastError{get;private set;}

    public bool UpdateAccess(RemoteSessionConfig config)
    {
        if(config.Id!=_config.Id
           ||config.Topic!=_config.Topic
           ||config.FrameToken!=_config.FrameToken
           ||config.ControlToken!=_config.ControlToken)
            return false;

        lock(_accessSync)
        {
            _remoteInputEnabled=config.RemoteInputEnabled;
            _inputToken=config.InputToken;
            _revision=config.Revision;
        }
        return true;
    }

    private (bool Enabled,string? Token) AccessSnapshot()
    {
        lock(_accessSync)return(_remoteInputEnabled,_inputToken);
    }

    public async Task<bool> ConnectAsync(CancellationToken cancellationToken)
    {
        using var linked=CancellationTokenSource.CreateLinkedTokenSource(cancellationToken,_stop.Token);
        try
        {
            LastError=null;
            await _socket.ConnectAsync(RealtimeBase,linked.Token);
            _receiveTask=ReceiveLoopAsync(_stop.Token);

            await SendEnvelopeAsync(
                "phx_join",
                new
                {
                    config=new
                    {
                        broadcast=new{ack=false,self=false},
                        presence=new{enabled=false,key=""},
                        postgres_changes=Array.Empty<object>(),
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
        catch(Exception ex)
        {
            LastError=ex.GetType().Name;
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

    public async Task SendInputResultAsync(
        string inputType,
        RemoteInputApplyResult result,
        CancellationToken cancellationToken)
    {
        if(!IsConnected)return;
        await SendBroadcastAsync("input_result",new
        {
            token=_config.FrameToken,
            type=inputType,
            ok=result.Ok,
            reason=result.Reason,
            x=result.X,
            y=result.Y,
            at=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        },cancellationToken);
    }

    public async Task SendControlResultAsync(
        string requestId,
        LightBurnControlBridgeResult result,
        CancellationToken cancellationToken)
    {
        if(!IsConnected)return;
        await SendBroadcastAsync("control_result",new
        {
            token=_config.FrameToken,
            requestId,
            ok=result.Ok,
            reason=result.Reason,
            snapshot=result.Snapshot,
            at=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        },cancellationToken);
    }

    private Task SendBroadcastAsync(string eventName,object payload,CancellationToken cancellationToken)=>
        SendEnvelopeAsync(
            "broadcast",
            new{type="broadcast",@event=eventName,payload},
            joinRef:"1",
            reference:Interlocked.Increment(ref _ref).ToString(),
            cancellationToken);

    private async Task SendEnvelopeAsync(
        string eventName,
        object payload,
        string? joinRef,
        string reference,
        CancellationToken cancellationToken)
    {
        if(_socket.State!=WebSocketState.Open)return;

        // Supabase Realtime uses the Phoenix v2 serializer by default in current clients:
        // [join_ref, ref, topic, event, payload].
        var message=JsonSerializer.Serialize(new object?[]
        {
            joinRef,
            reference,
            "realtime:"+_config.Topic,
            eventName,
            payload
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

                if(result.MessageType==WebSocketMessageType.Text)
                {
                    var json=Encoding.UTF8.GetString(stream.GetBuffer(),0,(int)stream.Length);
                    await HandleMessageAsync(json);
                }
                else if(result.MessageType==WebSocketMessageType.Binary)
                {
                    await HandleBinaryMessageAsync(stream.GetBuffer().AsMemory(0,(int)stream.Length));
                }
            }
            catch(OperationCanceledException) when(cancellationToken.IsCancellationRequested){return;}
            catch(Exception ex)
            {
                LastError=ex.GetType().Name;
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

            string? eventName;
            string? reference;
            JsonElement messagePayload;

            if(root.ValueKind==JsonValueKind.Array)
            {
                var parts=root.EnumerateArray().ToArray();
                if(parts.Length<5)return;
                reference=parts[1].ValueKind switch
                {
                    JsonValueKind.String=>parts[1].GetString(),
                    JsonValueKind.Number=>parts[1].ToString(),
                    _=>null
                };
                eventName=parts[3].ValueKind==JsonValueKind.String?parts[3].GetString():null;
                messagePayload=parts[4];
            }
            else if(root.ValueKind==JsonValueKind.Object)
            {
                eventName=root.TryGetProperty("event",out var ev)?ev.GetString():null;
                reference=root.TryGetProperty("ref",out var rf)
                    ?rf.ValueKind==JsonValueKind.String?rf.GetString():rf.ToString()
                    :null;
                if(!root.TryGetProperty("payload",out messagePayload))return;
            }
            else return;

            if(eventName=="phx_reply")
            {
                if(reference=="1"
                   &&messagePayload.ValueKind==JsonValueKind.Object
                   &&messagePayload.TryGetProperty("status",out var status))
                {
                    if(status.GetString()=="ok")
                    {
                        _joined.TrySetResult(true);
                    }
                    else
                    {
                        var reason="join_rejected";
                        if(messagePayload.TryGetProperty("response",out var response)
                           &&response.ValueKind==JsonValueKind.Object
                           &&response.TryGetProperty("reason",out var reasonEl)
                           &&reasonEl.ValueKind==JsonValueKind.String)
                            reason=reasonEl.GetString()??reason;
                        LastError=reason;
                        _joined.TrySetException(new InvalidOperationException(reason));
                    }
                }
                return;
            }

            if(eventName=="phx_error"||eventName=="phx_close")
            {
                LastError=eventName;
                return;
            }

            if(eventName!="broadcast"||messagePayload.ValueKind!=JsonValueKind.Object)
                return;

            var userEvent=messagePayload.TryGetProperty("event",out var userEv)?userEv.GetString():null;
            if(!messagePayload.TryGetProperty("payload",out var payload)
               ||payload.ValueKind!=JsonValueKind.Object)
                return;

            await HandleBroadcastAsync(userEvent,payload);
        }
        catch(Exception ex)
        {
            LastError=ex.GetType().Name;
        }
    }

    private async Task HandleBinaryMessageAsync(ReadOnlyMemory<byte> data)
    {
        try
        {
            var bytes=data.ToArray();
            if(bytes.Length<5)return;

            // Supabase Realtime protocol v2 server broadcast:
            // [0x04, topicSize, eventSize, metadataSize, payloadEncoding, ...]
            if(bytes[0]!=0x04)return;

            var topicSize=bytes[1];
            var eventSize=bytes[2];
            var metadataSize=bytes[3];
            var payloadEncoding=bytes[4];
            if(payloadEncoding!=1)return;

            var offset=5;
            var required=offset+topicSize+eventSize+metadataSize;
            if(bytes.Length<required)return;

            var topic=Encoding.UTF8.GetString(bytes,offset,topicSize);
            offset+=topicSize;
            if(!string.Equals(topic,"realtime:"+_config.Topic,StringComparison.Ordinal))return;

            var userEvent=Encoding.UTF8.GetString(bytes,offset,eventSize);
            offset+=eventSize+metadataSize;
            if(offset>bytes.Length)return;

            var payloadLength=bytes.Length-offset;
            if(payloadLength<=0)return;
            var payloadBytes=new byte[payloadLength];
            Array.Copy(bytes,offset,payloadBytes,0,payloadLength);

            using var payloadDoc=JsonDocument.Parse(payloadBytes);
            if(payloadDoc.RootElement.ValueKind!=JsonValueKind.Object)return;
            await HandleBroadcastAsync(userEvent,payloadDoc.RootElement);
        }
        catch(Exception ex)
        {
            LastError="binary:"+ex.GetType().Name;
        }
    }

    private async Task HandleBroadcastAsync(string? userEvent,JsonElement payload)
    {
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
                await _onCommand(new RealtimeCommand(token??"",id!,command!,expires));
            return;
        }

        if(userEvent!="remote_input"&&userEvent!="control_request")return;

        var access=AccessSnapshot();
        if(!access.Enabled||string.IsNullOrWhiteSpace(access.Token))return;
        var inputToken=payload.TryGetProperty("token",out var inputTokenEl)?inputTokenEl.GetString():"";
        if(!CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(inputToken??""),
            Encoding.UTF8.GetBytes(access.Token!)))
            return;

        static double? Number(JsonElement p,string name)=>
            p.TryGetProperty(name,out var e)&&e.TryGetDouble(out var v)?v:null;
        static bool Bool(JsonElement p,string name)=>
            p.TryGetProperty(name,out var e)&&e.ValueKind==JsonValueKind.True;
        static string? String(JsonElement p,string name)=>
            p.TryGetProperty(name,out var e)&&e.ValueKind==JsonValueKind.String?e.GetString():null;

        if(userEvent=="control_request")
        {
            if(_onControl is null)return;
            bool? toggle=null;
            if(payload.TryGetProperty("toggle",out var toggleEl))
            {
                if(toggleEl.ValueKind==JsonValueKind.True)toggle=true;
                else if(toggleEl.ValueKind==JsonValueKind.False)toggle=false;
            }
            var requestId=String(payload,"requestId");
            var action=String(payload,"action");
            if(string.IsNullOrWhiteSpace(requestId)||string.IsNullOrWhiteSpace(action))return;
            await _onControl(new RealtimeControlRequest(
                inputToken??"",requestId!,action!,
                String(payload,"field"),String(payload,"value"),toggle,String(payload,"layer")));
            return;
        }

        await _onInput(new RealtimeRemoteInput(
            inputToken??"",
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

    private async Task HeartbeatLoopAsync(CancellationToken cancellationToken)
    {
        while(!cancellationToken.IsCancellationRequested&&_socket.State==WebSocketState.Open)
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(25),cancellationToken);
                if(cancellationToken.IsCancellationRequested)return;
                var message=JsonSerializer.Serialize(new object?[]
                {
                    null,
                    Interlocked.Increment(ref _ref).ToString(),
                    "phoenix",
                    "heartbeat",
                    new{}
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
            catch(Exception ex)
            {
                LastError=ex.GetType().Name;
                return;
            }
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
