namespace DevinXLaserAgent;

internal sealed record RemoteSessionConfig(
    string Id,
    string Topic,
    string FrameToken,
    string ControlToken,
    string? InputToken,
    bool RemoteInputEnabled,
    long Revision,
    DateTimeOffset ExpiresAt);

internal sealed record RemoteCommand(
    string Id,
    string Type,
    DateTimeOffset? ExpiresAt);

internal sealed record AgentPollResult(
    bool Ok,
    RemoteSessionConfig? Session,
    RemoteCommand? Command,
    RealtimeWebRtcSignal? Signal,
    string? Reason);

internal sealed record RealtimeRemoteInput(
    string Token,
    string Type,
    double? X,
    double? Y,
    int Button,
    double DeltaY,
    string? Key,
    string? Code,
    bool Ctrl,
    bool Shift,
    bool Alt,
    bool Meta,
    string? RequestId);

internal sealed record RealtimeCommand(
    string Token,
    string CommandId,
    string Command,
    DateTimeOffset? ExpiresAt);


internal sealed record RealtimeControlRequest(
    string Token,
    string RequestId,
    string Action,
    string? Field,
    string? Value,
    bool? Toggle,
    string? Layer);


internal sealed record RealtimeWebRtcSignal(
    string Type,
    string? Sdp,
    string? Candidate,
    string? SdpMid,
    ushort? SdpMLineIndex);
