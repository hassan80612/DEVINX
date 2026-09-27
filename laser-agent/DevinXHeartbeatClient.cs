using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace DevinXLaserAgent;

internal sealed class DevinXHeartbeatClient : IDisposable
{
    private static readonly Uri HeartbeatUri =
        new("https://jubiwhtnhxluetzkzomm.supabase.co/functions/v1/laser-agent-heartbeat");

    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(10) };
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<HeartbeatResult> SendAsync(
        AgentIdentity identity,
        AgentTelemetry telemetry,
        CancellationToken cancellationToken = default)
    {
        var sequence = AgentSequenceStore.Next();
        var sentAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var telemetryBytes = JsonSerializer.SerializeToUtf8Bytes(telemetry, JsonOptions);
        var telemetryBase64 = Convert.ToBase64String(telemetryBytes);
        var telemetryHash = Convert.ToHexString(SHA256.HashData(telemetryBytes)).ToLowerInvariant();

        var canonical = string.Join("\n",
            "devinx-laser-heartbeat-v1",
            identity.DeviceId,
            identity.PublicKeyFingerprint,
            PairingProofFactory.AgentVersion,
            sequence.ToString(System.Globalization.CultureInfo.InvariantCulture),
            sentAt.ToString(System.Globalization.CultureInfo.InvariantCulture),
            telemetryHash);

        var envelope = new
        {
            version = 1,
            agentVersion = PairingProofFactory.AgentVersion,
            deviceId = identity.DeviceId,
            publicKeyFingerprint = identity.PublicKeyFingerprint,
            sequence,
            sentAt,
            telemetryBase64,
            signatureBase64 = AgentIdentityStore.SignBase64(canonical)
        };

        using var content = new StringContent(
            JsonSerializer.Serialize(envelope, JsonOptions),
            Encoding.UTF8,
            "application/json");

        using var response = await _http.PostAsync(HeartbeatUri, content, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            try
            {
                using var errorJson = JsonDocument.Parse(body);
                var reason = errorJson.RootElement.TryGetProperty("reason", out var element)
                    ? element.GetString()
                    : "request_failed";
                return new HeartbeatResult(false, reason ?? "request_failed", false, null);
            }
            catch
            {
                return new HeartbeatResult(false, "request_failed", false, null);
            }
        }

        try
        {
            using var json = JsonDocument.Parse(body);
            var previewActive = json.RootElement.TryGetProperty("previewActive", out var p) && p.GetBoolean();
            DateTimeOffset? previewUntil = null;
            if (json.RootElement.TryGetProperty("previewUntil", out var u)
                && u.ValueKind == JsonValueKind.String
                && DateTimeOffset.TryParse(u.GetString(), out var parsed))
                previewUntil = parsed;

            return new HeartbeatResult(true, null, previewActive, previewUntil);
        }
        catch
        {
            return new HeartbeatResult(true, null, false, null);
        }
    }

    public void Dispose() => _http.Dispose();
}

internal sealed record HeartbeatResult(bool Accepted,string? Reason,bool PreviewActive,DateTimeOffset? PreviewUntil);
