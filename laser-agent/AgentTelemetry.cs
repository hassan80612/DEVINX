using System.Text.Json;

namespace DevinXLaserAgent;

internal sealed record AgentTelemetry(
    int ProtocolVersion,
    string DeviceId,
    string PublicKeyFingerprint,
    string Adapter,
    bool LightBurnOnline,
    bool DeviceConnected,
    string? DeviceName,
    string JobState,
    double? Progress,
    string? ProjectFile,
    DateTimeOffset CapturedAtUtc);

internal static class AgentTelemetryFactory
{
    public static AgentTelemetry FromRest(AgentIdentity identity,string? statusJson,string? projectJson,string? pollJson)
    {
        var connected=false;
        string? deviceName=null;
        var jobState="unknown";
        double? progress=null;
        string? projectFile=null;

        if(!string.IsNullOrWhiteSpace(statusJson))
        {
            using var doc=JsonDocument.Parse(statusJson);
            if(doc.RootElement.TryGetProperty("connected",out var c)&&c.ValueKind is JsonValueKind.True or JsonValueKind.False)
                connected=c.GetBoolean();
            if(doc.RootElement.TryGetProperty("device_name",out var dn)&&dn.ValueKind==JsonValueKind.String)
                deviceName=Limit(dn.GetString(),160);
        }

        if(!string.IsNullOrWhiteSpace(projectJson))
        {
            using var doc=JsonDocument.Parse(projectJson);
            if(doc.RootElement.TryGetProperty("filename",out var file)&&file.ValueKind==JsonValueKind.String)
                projectFile=Limit(file.GetString(),500);
        }

        if(!string.IsNullOrWhiteSpace(pollJson))
        {
            using var doc=JsonDocument.Parse(pollJson);
            if(doc.RootElement.TryGetProperty("job",out var job))
            {
                if(job.TryGetProperty("state",out var s)&&s.ValueKind==JsonValueKind.String)
                    jobState=NormalizeJobState(s.GetString());
                if(job.TryGetProperty("progress",out var p)&&p.ValueKind==JsonValueKind.Number&&p.TryGetDouble(out var value))
                    progress=Math.Clamp(value,0,100);
            }
        }

        return new AgentTelemetry(
            1,
            identity.DeviceId,
            identity.PublicKeyFingerprint,
            "lightburn-rest",
            true,
            connected,
            deviceName,
            jobState,
            progress,
            projectFile,
            DateTimeOffset.UtcNow);
    }

    public static AgentTelemetry FromLegacyUdp(AgentIdentity identity,LightBurnReply ping,LightBurnReply? status)
    {
        var online=ping.Received&&ping.Response=="OK";
        var state=status?.Response=="OK"?"idle":"unknown";

        return new AgentTelemetry(
            1,
            identity.DeviceId,
            identity.PublicKeyFingerprint,
            "lightburn-udp-legacy",
            online,
            online,
            null,
            state,
            null,
            null,
            DateTimeOffset.UtcNow);
    }

    public static AgentTelemetry Offline(AgentIdentity identity) =>
        new(
            1,
            identity.DeviceId,
            identity.PublicKeyFingerprint,
            "lightburn-udp-legacy",
            false,
            false,
            null,
            "unknown",
            null,
            null,
            DateTimeOffset.UtcNow);

    private static string NormalizeJobState(string? value) =>
        value?.Trim().ToLowerInvariant() switch
        {
            "idle" => "idle",
            "running" => "running",
            "run" => "running",
            "paused" => "paused",
            "pause" => "paused",
            "busy" => "busy",
            _ => "unknown"
        };

    private static string? Limit(string? value,int maxLength)
    {
        if(string.IsNullOrWhiteSpace(value))return null;
        var trimmed=value.Trim();
        return trimmed.Length<=maxLength?trimmed:trimmed[..maxLength];
    }
}
