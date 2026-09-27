using System.Net;
using System.Text;
using System.Text.Json;

namespace DevinXLaserAgent;

internal sealed class DevinXMentorPairingClient:IDisposable
{
    private static readonly Uri OfferUri=
        new("https://jubiwhtnhxluetzkzomm.supabase.co/functions/v1/laser-agent-mentor-offer");
    private static readonly Uri StatusUri=
        new("https://jubiwhtnhxluetzkzomm.supabase.co/functions/v1/laser-agent-mentor-status");
    private readonly HttpClient _http=new(){Timeout=TimeSpan.FromSeconds(10)};
    private static readonly JsonSerializerOptions JsonOptions=new(JsonSerializerDefaults.Web);

    public async Task<PairingOfferResult> PublishAsync(MentorProof proof,CancellationToken token=default)
    {
        using var content=new StringContent(JsonSerializer.Serialize(proof,JsonOptions),Encoding.UTF8,"application/json");
        using var response=await _http.PostAsync(OfferUri,content,token);
        var text=await response.Content.ReadAsStringAsync(token);
        if(response.StatusCode==HttpStatusCode.TooManyRequests)return new(false,null,"rate_limited");
        if(!response.IsSuccessStatusCode)return new(false,null,ReadReason(text));
        using var doc=JsonDocument.Parse(text);
        return new(true,doc.RootElement.TryGetProperty("offerId",out var id)?id.GetString():null,null);
    }

    public async Task<MentorStatusResult> GetStatusAsync(MentorProof proof,CancellationToken token=default)
    {
        using var content=new StringContent(JsonSerializer.Serialize(proof,JsonOptions),Encoding.UTF8,"application/json");
        using var response=await _http.PostAsync(StatusUri,content,token);
        var text=await response.Content.ReadAsStringAsync(token);
        if(!response.IsSuccessStatusCode)return new(false,false,false,null,ReadReason(text));
        using var doc=JsonDocument.Parse(text);
        var root=doc.RootElement;
        DateTimeOffset? expires=null;
        if(root.TryGetProperty("sessionExpiresAt",out var exp)&&exp.ValueKind==JsonValueKind.String
           &&DateTimeOffset.TryParse(exp.GetString(),out var parsed))expires=parsed;
        return new(
            root.TryGetProperty("paired",out var paired)&&paired.GetBoolean(),
            root.TryGetProperty("offerPending",out var pending)&&pending.GetBoolean(),
            root.TryGetProperty("sessionActive",out var active)&&active.GetBoolean(),
            expires,null);
    }

    private static string ReadReason(string text)
    {
        try{
            using var doc=JsonDocument.Parse(text);
            return doc.RootElement.TryGetProperty("reason",out var r)?r.GetString()??"request_failed":"request_failed";
        }catch{return "request_failed";}
    }

    public void Dispose()=>_http.Dispose();
}

internal sealed record MentorStatusResult(
    bool Paired,bool OfferPending,bool SessionActive,DateTimeOffset? SessionExpiresAt,string? Reason);
