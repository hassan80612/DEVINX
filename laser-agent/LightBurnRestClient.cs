using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace DevinXLaserAgent;

internal sealed class LightBurnRestClient : IDisposable
{
    private const string ApplicationName = "DevinX Laser Agent";
    private static readonly Uri BaseUri = new("http://127.0.0.1:19520/");
    private readonly HttpClient _http = new() { BaseAddress = BaseUri, Timeout = TimeSpan.FromSeconds(3) };

    public async Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            using var response = await _http.GetAsync("/", cancellationToken);
            return response.StatusCode is HttpStatusCode.OK or HttpStatusCode.Unauthorized;
        }
        catch (HttpRequestException) { return false; }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested) { return false; }
    }

    public async Task<string> PairReadOnlyAsync(CancellationToken cancellationToken = default)
    {
        var body = JsonSerializer.Serialize(new
        {
            application_name = ApplicationName,
            capabilities = new[] { "state", "project" }
        });

        using var response = await _http.PostAsync(
            "api/connect",
            new StringContent(body, Encoding.UTF8, "application/json"),
            cancellationToken);

        var text = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException("LightBurn pairing was not approved or failed.");

        using var json = JsonDocument.Parse(text);
        if (!json.RootElement.TryGetProperty("secret", out var secretElement))
            throw new InvalidOperationException("LightBurn did not return a pairing secret.");

        var secret = secretElement.GetString();
        if (string.IsNullOrWhiteSpace(secret))
            throw new InvalidOperationException("LightBurn returned an empty pairing secret.");

        return secret;
    }

    public async Task<string?> GetStatusJsonAsync(string secret, CancellationToken cancellationToken = default) =>
        await GetAuthenticatedJsonAsync("api/status", secret, cancellationToken);

    public async Task<string?> GetProjectJsonAsync(string secret, CancellationToken cancellationToken = default) =>
        await GetAuthenticatedJsonAsync("api/project", secret, cancellationToken);

    public async Task<string?> GetPollSnapshotJsonAsync(string secret, CancellationToken cancellationToken = default) =>
        await GetAuthenticatedJsonAsync("api/events/poll", secret, cancellationToken);

    private async Task<string?> GetAuthenticatedJsonAsync(string path, string secret, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", CreateBearerToken(secret));
        using var response = await _http.SendAsync(request, cancellationToken);
        if (response.StatusCode == HttpStatusCode.Unauthorized)return null;
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsStringAsync(cancellationToken);
    }

    private static string CreateBearerToken(string secret)
    {
        var minute = DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 60;
        var message = Encoding.UTF8.GetBytes(minute.ToString(CultureInfo.InvariantCulture));
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        return Convert.ToHexString(hmac.ComputeHash(message)).ToLowerInvariant();
    }

    public void Dispose() => _http.Dispose();
}
