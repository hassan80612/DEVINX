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
    RemoteCommand? Command);

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
    bool Meta);

internal sealed record RealtimeCommand(
    string Token,
    string CommandId,
    string Command,
    DateTimeOffset? ExpiresAt);
