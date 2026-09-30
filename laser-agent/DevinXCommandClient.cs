using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace DevinXLaserAgent;

internal sealed class DevinXCommandClient : IDisposable
{
    private static readonly Uri CommandUri =
        new("https://jubiwhtnhxluetzkzomm.supabase.co/functions/v1/laser-agent-command");

    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(15) };
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<AgentPollResult> PollAsync(
        AgentIdentity identity,
        string? knownSessionId,
        long knownRevision,
        CancellationToken cancellationToken = default)
    {
        var response = await SendAsync(
            identity,"poll",null,null,null,
            knownSessionId,knownRevision,cancellationToken);

        return new AgentPollResult(response.Ok,response.Session,response.Command,response.Signal,response.Reason);
    }

    public async Task<bool> AckAsync(
        AgentIdentity identity,
        string commandId,
        bool ok,
        string? reason,
        CancellationToken cancellationToken = default)
    {
        var response = await SendAsync(
            identity,"ack",commandId,ok,reason,
            null,0,cancellationToken);
        return response.Ok;
    }

    public async Task<bool> NotifyUninstallAsync(
        AgentIdentity identity,
        CancellationToken cancellationToken = default)
    {
        var response = await SendAsync(
            identity,"uninstall",null,null,null,
            null,0,cancellationToken);
        return response.Ok;
    }

    private async Task<CommandResponse> SendAsync(
        AgentIdentity identity,
        string action,
        string? commandId,
        bool? ok,
        string? reason,
        string? knownSessionId,
        long knownRevision,
        CancellationToken cancellationToken)
    {
        var sentAt=DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var nonce=Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        reason=string.IsNullOrWhiteSpace(reason)?null:reason.Trim();
        if(reason is {Length:>160})reason=reason[..160];

        var canonical=string.Join("\n",
            "devinx-laser-command-v2",
            identity.DeviceId,
            identity.PublicKeyFingerprint,
            sentAt.ToString(System.Globalization.CultureInfo.InvariantCulture),
            nonce,
            action,
            action=="ack"?commandId??"":"",
            action=="ack"?(ok==true?"1":"0"):"",
            action=="ack"?reason??"":"",
            action=="poll"?knownSessionId??"":"",
            action=="poll"?knownRevision.ToString(System.Globalization.CultureInfo.InvariantCulture):"");

        var envelope=new
        {
            deviceId=identity.DeviceId,
            publicKeyFingerprint=identity.PublicKeyFingerprint,
            sentAt,
            nonce,
            action,
            commandId,
            ok,
            reason,
            knownSessionId,
            knownRevision,
            signatureBase64=AgentIdentityStore.SignBase64(canonical)
        };

        using var content=new StringContent(
            JsonSerializer.Serialize(envelope,JsonOptions),
            Encoding.UTF8,
            "application/json");

        using var httpResponse=await _http.PostAsync(CommandUri,content,cancellationToken);
        var body=await httpResponse.Content.ReadAsStringAsync(cancellationToken);
        if(!httpResponse.IsSuccessStatusCode)
        {
            string? failureReason=null;
            try
            {
                using var errorJson=JsonDocument.Parse(body);
                failureReason=errorJson.RootElement.TryGetProperty("reason",out var reasonEl)
                    ?reasonEl.GetString()
                    :errorJson.RootElement.TryGetProperty("error",out var errorEl)?errorEl.GetString():null;
            }
            catch{}
            return CommandResponse.Failed(failureReason??"request_failed");
        }

        try
        {
            using var json=JsonDocument.Parse(body);
            var root=json.RootElement;
            var responseOk=root.TryGetProperty("ok",out var okElement)&&okElement.GetBoolean();

            RemoteSessionConfig? session=null;
            if(root.TryGetProperty("session",out var sessionElement)
               &&sessionElement.ValueKind==JsonValueKind.Object)
            {
                var id=sessionElement.GetProperty("id").GetString();
                var topic=sessionElement.GetProperty("topic").GetString();
                var frameToken=sessionElement.GetProperty("frameToken").GetString();
                var controlToken=sessionElement.GetProperty("controlToken").GetString();
                string? inputToken=null;
                if(sessionElement.TryGetProperty("inputToken",out var input)
                   &&input.ValueKind==JsonValueKind.String)
                    inputToken=input.GetString();

                var inputEnabled=sessionElement.TryGetProperty("remoteInputEnabled",out var enabled)
                    &&enabled.GetBoolean();
                var revision=sessionElement.TryGetProperty("revision",out var rev)
                    &&rev.TryGetInt64(out var rv)?rv:0;
                var expires=sessionElement.TryGetProperty("expiresAt",out var exp)
                    &&DateTimeOffset.TryParse(exp.GetString(),out var parsedExp)
                    ?parsedExp:DateTimeOffset.UtcNow;

                if(!string.IsNullOrWhiteSpace(id)
                   &&!string.IsNullOrWhiteSpace(topic)
                   &&!string.IsNullOrWhiteSpace(frameToken)
                   &&!string.IsNullOrWhiteSpace(controlToken))
                {
                    session=new RemoteSessionConfig(
                        id!,topic!,frameToken!,controlToken!,inputToken,
                        inputEnabled,revision,expires);
                }
            }

            RealtimeWebRtcSignal? signal=null;
            if(root.TryGetProperty("signal",out var signalElement)
               &&signalElement.ValueKind==JsonValueKind.Object)
            {
                var eventName=signalElement.TryGetProperty("event",out var eventEl)
                    &&eventEl.ValueKind==JsonValueKind.String
                    ?eventEl.GetString()
                    :null;
                if(signalElement.TryGetProperty("payload",out var signalPayload)
                   &&signalPayload.ValueKind==JsonValueKind.Object)
                {
                    static string? SignalString(JsonElement p,string name)=>
                        p.TryGetProperty(name,out var e)&&e.ValueKind==JsonValueKind.String?e.GetString():null;

                    ushort? lineIndex=null;
                    if(signalPayload.TryGetProperty("sdpMLineIndex",out var lineEl)
                       &&lineEl.TryGetInt32(out var line)
                       &&line is>=0 and<=ushort.MaxValue)
                        lineIndex=(ushort)line;

                    if(eventName=="webrtc_offer")
                        signal=new RealtimeWebRtcSignal("offer",SignalString(signalPayload,"sdp"),null,null,null);
                    else if(eventName=="webrtc_ice")
                        signal=new RealtimeWebRtcSignal(
                            "ice",null,SignalString(signalPayload,"candidate"),
                            SignalString(signalPayload,"sdpMid"),lineIndex);
                    else if(eventName=="webrtc_stop")
                        signal=new RealtimeWebRtcSignal("stop",null,null,null,null);
                }
            }

            RemoteCommand? command=null;
            if(root.TryGetProperty("command",out var commandElement)
               &&commandElement.ValueKind==JsonValueKind.Object)
            {
                var id=commandElement.TryGetProperty("id",out var idEl)?idEl.GetString():null;
                var type=commandElement.TryGetProperty("type",out var typeEl)?typeEl.GetString():null;
                DateTimeOffset? expires=null;
                if(commandElement.TryGetProperty("expiresAt",out var expEl)
                   &&expEl.ValueKind==JsonValueKind.String
                   &&DateTimeOffset.TryParse(expEl.GetString(),out var parsed))
                    expires=parsed;

                if(!string.IsNullOrWhiteSpace(id)&&!string.IsNullOrWhiteSpace(type))
                    command=new RemoteCommand(id!,type!,expires);
            }

            return new CommandResponse(responseOk,session,command,signal,null);
        }
        catch
        {
            return CommandResponse.Failed("invalid_response");
        }
    }

    public void Dispose()=>_http.Dispose();

    private sealed record CommandResponse(
        bool Ok,
        RemoteSessionConfig? Session,
        RemoteCommand? Command,
        RealtimeWebRtcSignal? Signal,
        string? Reason)
    {
        public static CommandResponse Failed(string reason)=>new(false,null,null,null,reason);
    }
}
