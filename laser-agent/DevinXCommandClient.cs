using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace DevinXLaserAgent;

internal sealed class DevinXCommandClient : IDisposable
{
    private static readonly Uri CommandUri =
        new("https://jubiwhtnhxluetzkzomm.supabase.co/functions/v1/laser-agent-command");

    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(5) };
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<RemoteArmResult> SetRemoteArmAsync(
        AgentIdentity identity,
        bool enabled,
        CancellationToken cancellationToken = default)
    {
        var response = await SendAsync(identity, "arm", enabled, null, null, null, cancellationToken);
        return new RemoteArmResult(response.Ok, response.LocalArmUntil);
    }

    public async Task<RemoteCommand?> PollAsync(
        AgentIdentity identity,
        CancellationToken cancellationToken = default)
    {
        var response = await SendAsync(identity, "poll", null, null, null, null, cancellationToken);
        if (!response.Ok || response.CommandId is null || response.CommandType is null) return null;
        return new RemoteCommand(response.CommandId, response.CommandType, response.CommandExpiresAt);
    }

    public async Task<bool> AckAsync(
        AgentIdentity identity,
        string commandId,
        bool ok,
        string? reason,
        CancellationToken cancellationToken = default)
    {
        var response = await SendAsync(identity, "ack", null, commandId, ok, reason, cancellationToken);
        return response.Ok;
    }

    private async Task<CommandResponse> SendAsync(
        AgentIdentity identity,
        string action,
        bool? enabled,
        string? commandId,
        bool? ok,
        string? reason,
        CancellationToken cancellationToken)
    {
        var sentAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var nonce = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        reason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim();
        if (reason is { Length: > 160 }) reason = reason[..160];

        var canonical = string.Join("\n",
            "devinx-laser-command-v1",
            identity.DeviceId,
            identity.PublicKeyFingerprint,
            sentAt.ToString(System.Globalization.CultureInfo.InvariantCulture),
            nonce,
            action,
            action == "arm" ? (enabled == true ? "1" : "0") : "",
            action == "ack" ? commandId ?? "" : "",
            action == "ack" ? (ok == true ? "1" : "0") : "",
            action == "ack" ? reason ?? "" : "");

        var envelope = new
        {
            deviceId = identity.DeviceId,
            publicKeyFingerprint = identity.PublicKeyFingerprint,
            sentAt,
            nonce,
            action,
            enabled,
            commandId,
            ok,
            reason,
            signatureBase64 = AgentIdentityStore.SignBase64(canonical)
        };

        using var content = new StringContent(
            JsonSerializer.Serialize(envelope, JsonOptions),
            Encoding.UTF8,
            "application/json");

        using var httpResponse = await _http.PostAsync(CommandUri, content, cancellationToken);
        var body = await httpResponse.Content.ReadAsStringAsync(cancellationToken);
        if (!httpResponse.IsSuccessStatusCode)
            return CommandResponse.Failed;

        try
        {
            using var json = JsonDocument.Parse(body);
            var root = json.RootElement;
            var responseOk = root.TryGetProperty("ok", out var okElement) && okElement.GetBoolean();

            DateTimeOffset? armUntil = null;
            if (root.TryGetProperty("localArmUntil", out var arm)
                && arm.ValueKind == JsonValueKind.String
                && DateTimeOffset.TryParse(arm.GetString(), out var parsedArm))
                armUntil = parsedArm;

            string? id = null;
            string? type = null;
            DateTimeOffset? expiresAt = null;
            if (root.TryGetProperty("command", out var command)
                && command.ValueKind == JsonValueKind.Object)
            {
                if (command.TryGetProperty("id", out var idEl)) id = idEl.GetString();
                if (command.TryGetProperty("type", out var typeEl)) type = typeEl.GetString();
                if (command.TryGetProperty("expiresAt", out var expEl)
                    && expEl.ValueKind == JsonValueKind.String
                    && DateTimeOffset.TryParse(expEl.GetString(), out var parsedExp))
                    expiresAt = parsedExp;
            }

            return new CommandResponse(responseOk, armUntil, id, type, expiresAt);
        }
        catch
        {
            return CommandResponse.Failed;
        }
    }

    public void Dispose() => _http.Dispose();

    private sealed record CommandResponse(
        bool Ok,
        DateTimeOffset? LocalArmUntil,
        string? CommandId,
        string? CommandType,
        DateTimeOffset? CommandExpiresAt)
    {
        public static readonly CommandResponse Failed = new(false, null, null, null, null);
    }
}

internal sealed record RemoteArmResult(bool Ok, DateTimeOffset? LocalArmUntil);
internal sealed record RemoteCommand(string Id, string Type, DateTimeOffset? ExpiresAt);
