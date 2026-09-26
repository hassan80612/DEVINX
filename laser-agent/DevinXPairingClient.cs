using System.Net;
using System.Text;
using System.Text.Json;

namespace DevinXLaserAgent;

internal sealed class DevinXPairingClient : IDisposable
{
    private static readonly Uri PairingOfferUri =
        new("https://jubiwhtnhxluetzkzomm.supabase.co/functions/v1/laser-agent-pairing-offer");
    private static readonly Uri PairingStatusUri =
        new("https://jubiwhtnhxluetzkzomm.supabase.co/functions/v1/laser-agent-pairing-status");

    private readonly HttpClient _http = new()
    {
        Timeout = TimeSpan.FromSeconds(10)
    };

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<PairingOfferResult> PublishAsync(
        PairingProof proof,
        CancellationToken cancellationToken = default)
    {
        var json = JsonSerializer.Serialize(proof, JsonOptions);
        using var content = new StringContent(json, Encoding.UTF8, "application/json");
        using var response = await _http.PostAsync(PairingOfferUri, content, cancellationToken);
        var responseText = await response.Content.ReadAsStringAsync(cancellationToken);

        if (response.StatusCode == HttpStatusCode.TooManyRequests)
            return new PairingOfferResult(false, null, "rate_limited");

        if (!response.IsSuccessStatusCode)
            return new PairingOfferResult(false, null, ReadReason(responseText));

        using var document = JsonDocument.Parse(responseText);
        var offerId = document.RootElement.TryGetProperty("offerId", out var offerElement)
            ? offerElement.GetString()
            : null;

        return new PairingOfferResult(true, offerId, null);
    }

    public async Task<PairingStatusResult> GetStatusAsync(
        PairingProof proof,
        CancellationToken cancellationToken = default)
    {
        var json = JsonSerializer.Serialize(proof, JsonOptions);
        using var content = new StringContent(json, Encoding.UTF8, "application/json");
        using var response = await _http.PostAsync(PairingStatusUri, content, cancellationToken);
        var responseText = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
            return new PairingStatusResult(false, null, false, ReadReason(responseText));

        using var document = JsonDocument.Parse(responseText);
        var root = document.RootElement;
        var paired = root.TryGetProperty("paired", out var pairedElement) && pairedElement.GetBoolean();
        var pending = root.TryGetProperty("offerPending", out var pendingElement) && pendingElement.GetBoolean();
        var status = root.TryGetProperty("deviceStatus", out var statusElement) && statusElement.ValueKind == JsonValueKind.String
            ? statusElement.GetString()
            : null;

        return new PairingStatusResult(paired, status, pending, null);
    }

    private static string ReadReason(string responseText)
    {
        try
        {
            using var errorJson = JsonDocument.Parse(responseText);
            return errorJson.RootElement.TryGetProperty("reason", out var reasonElement)
                ? reasonElement.GetString() ?? "request_failed"
                : "request_failed";
        }
        catch
        {
            return "request_failed";
        }
    }

    public void Dispose() => _http.Dispose();
}

internal sealed record PairingOfferResult(bool Accepted, string? OfferId, string? Reason);
internal sealed record PairingStatusResult(bool Paired, string? DeviceStatus, bool OfferPending, string? Reason);
