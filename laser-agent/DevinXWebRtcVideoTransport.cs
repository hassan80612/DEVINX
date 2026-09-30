using SIPSorcery.Net;
using SIPSorceryMedia.Abstractions;
using Vpx.Net;

namespace DevinXLaserAgent;

internal sealed class DevinXWebRtcVideoTransport : IAsyncDisposable
{
    private const string StunUrl="stun:stun.cloudflare.com:3478";
    private readonly DevinXRealtimeSession _realtime;
    private readonly CancellationTokenSource _stop=new();
    private readonly object _gate=new();
    private readonly List<RTCIceCandidateInit> _pendingRemoteCandidates=new();
    private RTCPeerConnection? _peer;
    private Vp8NetVideoEncoderEndPoint? _encoder;
    private bool _remoteDescriptionApplied;
    private int _connected;

    public DevinXWebRtcVideoTransport(DevinXRealtimeSession realtime)=>_realtime=realtime;
    public bool IsConnected=>Volatile.Read(ref _connected)==1;

    public async Task HandleSignalAsync(RealtimeWebRtcSignal signal,CancellationToken cancellationToken)
    {
        if(_stop.IsCancellationRequested)return;
        try
        {
            if(signal.Type=="offer"&&!string.IsNullOrWhiteSpace(signal.Sdp))
                await HandleOfferAsync(signal.Sdp!,cancellationToken);
            else if(signal.Type=="ice"&&!string.IsNullOrWhiteSpace(signal.Candidate))
                AddRemoteCandidate(signal);
            else if(signal.Type=="stop")
                ClosePeer("browser_fallback");
        }
        catch
        {
            ClosePeer("webrtc_signal_error");
            await SendStateSafeAsync("fallback",cancellationToken);
        }
    }

    public bool TrySendFrame(WebRtcRawFrame frame)
    {
        if(!IsConnected)return false;
        Vp8NetVideoEncoderEndPoint? encoder;
        lock(_gate)encoder=_encoder;
        if(encoder is null)return false;
        try
        {
            encoder.ExternalVideoSourceRawSample(67,frame.Width,frame.Height,frame.Bgr,VideoPixelFormatsEnum.Bgr);
            return true;
        }
        catch
        {
            ClosePeer("video_encode_error");
            _=SendStateSafeAsync("fallback",CancellationToken.None);
            return false;
        }
    }

    private async Task HandleOfferAsync(string sdp,CancellationToken cancellationToken)
    {
        List<RTCIceCandidateInit> pending;
        lock(_gate){pending=_pendingRemoteCandidates.ToList();_pendingRemoteCandidates.Clear();}
        ClosePeer("new_offer");

        var peer=new RTCPeerConnection(new RTCConfiguration
        {
            iceServers=new List<RTCIceServer>{new(){urls=StunUrl}}
        });
        var encoder=new Vp8NetVideoEncoderEndPoint
        {
            BaseQIndex=26,
            KeyframeIntervalFrames=45,
            EnableIntraFallback=false
        };
        peer.addTrack(new MediaStreamTrack(encoder.GetVideoSourceFormats(),MediaStreamStatusEnum.SendOnly));
        encoder.OnVideoSourceEncodedSample+=peer.SendVideo;
        peer.OnVideoFormatsNegotiated+=(formats)=>{if(formats.Count>0)encoder.SetVideoSourceFormat(formats.First());};

        peer.onicecandidate+=(candidate)=>{
            if(_stop.IsCancellationRequested||string.IsNullOrWhiteSpace(candidate.candidate))return;
            _=SendIceSafeAsync(candidate);
        };
        peer.onconnectionstatechange+=(state)=>{
            var connected=state==RTCPeerConnectionState.connected;
            var previous=Interlocked.Exchange(ref _connected,connected?1:0);
            if(connected&&previous==0)_=SendStateSafeAsync("connected",CancellationToken.None);
            else if(!connected&&previous==1)_=SendStateSafeAsync("fallback",CancellationToken.None);
            if(state==RTCPeerConnectionState.failed)try{peer.Close("ice_failed");}catch{}
        };

        lock(_gate){_peer=peer;_encoder=encoder;_remoteDescriptionApplied=false;}

        var result=peer.setRemoteDescription(new RTCSessionDescriptionInit{type=RTCSdpType.offer,sdp=sdp});
        if(result!=SetDescriptionResultEnum.OK)throw new InvalidOperationException("remote_offer_rejected");
        lock(_gate)_remoteDescriptionApplied=true;
        foreach(var candidate in pending)try{peer.addIceCandidate(candidate);}catch{}

        var answer=peer.createAnswer();
        await peer.setLocalDescription(answer);
        await _realtime.SendWebRtcAnswerAsync(answer.sdp,cancellationToken);
    }

    private void AddRemoteCandidate(RealtimeWebRtcSignal signal)
    {
        var candidate=new RTCIceCandidateInit
        {
            candidate=signal.Candidate!,
            sdpMid=string.IsNullOrWhiteSpace(signal.SdpMid)?"0":signal.SdpMid!,
            sdpMLineIndex=signal.SdpMLineIndex??0
        };
        RTCPeerConnection? peer;
        bool ready;
        lock(_gate)
        {
            peer=_peer;ready=_remoteDescriptionApplied;
            if(peer is null||!ready){_pendingRemoteCandidates.Add(candidate);return;}
        }
        try{peer.addIceCandidate(candidate);}catch{}
    }

    private async Task SendIceSafeAsync(RTCIceCandidate candidate)
    {
        try{await _realtime.SendWebRtcIceAsync(candidate.candidate,candidate.sdpMid,candidate.sdpMLineIndex,_stop.IsCancellationRequested?CancellationToken.None:_stop.Token);}
        catch{}
    }

    private async Task SendStateSafeAsync(string state,CancellationToken cancellationToken)
    {
        try{await _realtime.SendWebRtcStateAsync(state,cancellationToken);}catch{}
    }

    private void ClosePeer(string reason)
    {
        RTCPeerConnection? peer;
        Vp8NetVideoEncoderEndPoint? encoder;
        lock(_gate)
        {
            peer=_peer;encoder=_encoder;_peer=null;_encoder=null;_remoteDescriptionApplied=false;
        }
        Interlocked.Exchange(ref _connected,0);
        try{if(peer is not null&&encoder is not null)encoder.OnVideoSourceEncodedSample-=peer.SendVideo;}catch{}
        try{peer?.Close(reason);}catch{}
        try{encoder?.Dispose();}catch{}
    }

    public ValueTask DisposeAsync()
    {
        _stop.Cancel();
        ClosePeer("session_ended");
        _stop.Dispose();
        return ValueTask.CompletedTask;
    }
}
