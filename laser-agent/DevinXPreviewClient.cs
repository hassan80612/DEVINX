using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace DevinXLaserAgent;

internal sealed class DevinXPreviewClient : IDisposable
{
    private static readonly Uri UploadUri=
        new("https://jubiwhtnhxluetzkzomm.supabase.co/functions/v1/laser-agent-preview-upload");

    private readonly HttpClient _http=new(){Timeout=TimeSpan.FromSeconds(12)};

    public async Task<PreviewUploadResult> UploadAsync(
        AgentIdentity identity,
        CapturedPreview preview,
        CancellationToken cancellationToken=default)
    {
        var sentAt=DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var capturedAt=preview.CapturedAtUtc.ToUnixTimeSeconds();
        var hash=Convert.ToHexString(SHA256.HashData(preview.Jpeg)).ToLowerInvariant();

        var canonical=string.Join("\n",
            "devinx-laser-preview-v1",
            identity.DeviceId,
            identity.PublicKeyFingerprint,
            sentAt.ToString(System.Globalization.CultureInfo.InvariantCulture),
            capturedAt.ToString(System.Globalization.CultureInfo.InvariantCulture),
            preview.Width.ToString(System.Globalization.CultureInfo.InvariantCulture),
            preview.Height.ToString(System.Globalization.CultureInfo.InvariantCulture),
            hash);

        using var request=new HttpRequestMessage(HttpMethod.Post,UploadUri);
        request.Headers.TryAddWithoutValidation("x-devinx-device-id",identity.DeviceId);
        request.Headers.TryAddWithoutValidation("x-devinx-fingerprint",identity.PublicKeyFingerprint);
        request.Headers.TryAddWithoutValidation("x-devinx-sent-at",sentAt.ToString(System.Globalization.CultureInfo.InvariantCulture));
        request.Headers.TryAddWithoutValidation("x-devinx-captured-at",capturedAt.ToString(System.Globalization.CultureInfo.InvariantCulture));
        request.Headers.TryAddWithoutValidation("x-devinx-width",preview.Width.ToString(System.Globalization.CultureInfo.InvariantCulture));
        request.Headers.TryAddWithoutValidation("x-devinx-height",preview.Height.ToString(System.Globalization.CultureInfo.InvariantCulture));
        request.Headers.TryAddWithoutValidation("x-devinx-signature",AgentIdentityStore.SignBase64(canonical));
        request.Content=new ByteArrayContent(preview.Jpeg);
        request.Content.Headers.ContentType=new System.Net.Http.Headers.MediaTypeHeaderValue("image/jpeg");

        using var response=await _http.SendAsync(request,cancellationToken);
        var body=await response.Content.ReadAsStringAsync(cancellationToken);

        try
        {
            using var json=JsonDocument.Parse(body);
            var accepted=json.RootElement.TryGetProperty("accepted",out var a)&&a.GetBoolean();
            var reason=json.RootElement.TryGetProperty("reason",out var r)?r.GetString():null;
            var version=json.RootElement.TryGetProperty("frameVersion",out var v)&&v.TryGetInt64(out var n)?n:0;
            return new PreviewUploadResult(accepted,reason,version);
        }
        catch
        {
            return new PreviewUploadResult(false,response.IsSuccessStatusCode?null:"request_failed",0);
        }
    }

    public void Dispose()=>_http.Dispose();
}

internal sealed record PreviewUploadResult(bool Accepted,string? Reason,long FrameVersion);
