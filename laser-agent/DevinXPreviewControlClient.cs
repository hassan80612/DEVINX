using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace DevinXLaserAgent;

internal sealed class DevinXPreviewControlClient : IDisposable
{
    private static readonly Uri ControlUri =
        new("https://jubiwhtnhxluetzkzomm.supabase.co/functions/v1/laser-agent-preview-control");

    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(6) };
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<PreviewControlState?> PollAsync(
        AgentIdentity identity,
        long afterSeq,
        CancellationToken cancellationToken = default)
    {
        var response = await SendAsync(identity, "poll", null, afterSeq, cancellationToken);
        if (!response.Ok) return null;

        return new PreviewControlState(
            response.PreviewActive,
            response.TouchEnabled,
            response.LocalArmUntil,
            response.EventSeq,
            response.TouchEventType,
            response.TouchX,
            response.TouchY);
    }

    public async Task<PreviewArmResult> SetLocalArmAsync(
        AgentIdentity identity,
        bool enabled,
        CancellationToken cancellationToken = default)
    {
        var response = await SendAsync(identity, "arm", enabled, 0, cancellationToken);
        return new PreviewArmResult(response.Ok, response.LocalArmUntil);
    }

    private async Task<ControlResponse> SendAsync(
        AgentIdentity identity,
        string action,
        bool? enabled,
        long afterSeq,
        CancellationToken cancellationToken)
    {
        var sentAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var nonce = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();

        var canonical = string.Join("\n",
            "devinx-laser-preview-control-v1",
            identity.DeviceId,
            identity.PublicKeyFingerprint,
            sentAt.ToString(System.Globalization.CultureInfo.InvariantCulture),
            nonce,
            action,
            action == "arm" ? (enabled == true ? "1" : "0") : "",
            action == "poll" ? afterSeq.ToString(System.Globalization.CultureInfo.InvariantCulture) : "");

        var envelope = new
        {
            deviceId = identity.DeviceId,
            publicKeyFingerprint = identity.PublicKeyFingerprint,
            sentAt,
            nonce,
            action,
            enabled,
            afterSeq,
            signatureBase64 = AgentIdentityStore.SignBase64(canonical)
        };

        using var content = new StringContent(
            JsonSerializer.Serialize(envelope, JsonOptions),
            Encoding.UTF8,
            "application/json");

        using var httpResponse = await _http.PostAsync(ControlUri, content, cancellationToken);
        var body = await httpResponse.Content.ReadAsStringAsync(cancellationToken);
        if (!httpResponse.IsSuccessStatusCode)
            return new ControlResponse(false, false, false, null, afterSeq, null, null, null);

        try
        {
            using var json = JsonDocument.Parse(body);
            var root = json.RootElement;
            var ok = root.TryGetProperty("ok", out var okElement) && okElement.GetBoolean();
            var previewActive = root.TryGetProperty("previewActive", out var preview) && preview.GetBoolean();
            var touchEnabled = root.TryGetProperty("touchEnabled", out var touch) && touch.GetBoolean();

            DateTimeOffset? localArmUntil = null;
            if (root.TryGetProperty("localArmUntil", out var arm)
                && arm.ValueKind == JsonValueKind.String
                && DateTimeOffset.TryParse(arm.GetString(), out var parsed))
                localArmUntil = parsed;

            var eventSeq = root.TryGetProperty("eventSeq", out var seq) && seq.TryGetInt64(out var value)
                ? value
                : afterSeq;

            string? type = null;
            double? x = null;
            double? y = null;
            if (root.TryGetProperty("touchEvent", out var touchEvent)
                && touchEvent.ValueKind == JsonValueKind.Object)
            {
                if (touchEvent.TryGetProperty("type", out var typeElement))
                    type = typeElement.GetString();
                if (touchEvent.TryGetProperty("x", out var xElement) && xElement.TryGetDouble(out var xv))
                    x = xv;
                if (touchEvent.TryGetProperty("y", out var yElement) && yElement.TryGetDouble(out var yv))
                    y = yv;
            }

            return new ControlResponse(ok, previewActive, touchEnabled, localArmUntil, eventSeq, type, x, y);
        }
        catch
        {
            return new ControlResponse(false, false, false, null, afterSeq, null, null, null);
        }
    }

    public void Dispose() => _http.Dispose();

    private sealed record ControlResponse(
        bool Ok,
        bool PreviewActive,
        bool TouchEnabled,
        DateTimeOffset? LocalArmUntil,
        long EventSeq,
        string? TouchEventType,
        double? TouchX,
        double? TouchY);
}

internal sealed record PreviewControlState(
    bool PreviewActive,
    bool TouchEnabled,
    DateTimeOffset? LocalArmUntil,
    long EventSeq,
    string? TouchEventType,
    double? TouchX,
    double? TouchY);

internal sealed record PreviewArmResult(bool Ok, DateTimeOffset? LocalArmUntil);
