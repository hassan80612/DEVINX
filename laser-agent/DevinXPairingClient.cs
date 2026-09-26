using System.Net;
using System.Text;
using System.Text.Json;

namespace DevinXLaserAgent;

internal sealed class DevinXPairingClient : IDisposable
{
    private static readonly Uri PairingOfferUri =
        new("https://jubiwhtnhxluetzkzomm.supabase.co/functions/v1/laser-agent-pairing-offer");

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
        {
            try
            {
                using var errorJson = JsonDocument.Parse(responseText);
                var reason = errorJson.RootElement.TryGetProperty("reason", out var reasonElement)
                    ? reasonElement.GetString()
                    : "request_failed";
                return new PairingOfferResult(false, null, reason ?? "request_failed");
            }
            catch
            {
                return new PairingOfferResult(false, null, "request_failed");
            }
        }

        using var document = JsonDocument.Parse(responseText);
        var offerId = document.RootElement.TryGetProperty("offerId", out var offerElement)
            ? offerElement.GetString()
            : null;

        return new PairingOfferResult(true, offerId, null);
    }

    public void Dispose() => _http.Dispose();
}

internal sealed record PairingOfferResult(bool Accepted, string? OfferId, string? Reason);
