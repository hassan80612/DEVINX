using System.Security.Cryptography;

namespace DevinXLaserAgent;

internal sealed record MentorProof(
    int Version,
    string AgentVersion,
    string DeviceId,
    string DeviceName,
    string PublicKeyPem,
    string PublicKeyFingerprint,
    string PairingCode,
    DateTimeOffset ExpiresAt,
    string Nonce,
    string SignatureBase64);

internal static class MentorProofFactory
{
    private static readonly char[] Alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789".ToCharArray();

    public static MentorProof Create(TimeSpan lifetime)
    {
        var identity=AgentIdentityStore.GetOrCreate();
        var expiresAt=DateTimeOffset.UtcNow.Add(lifetime);
        var nonce=Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        var code=RandomCode(8);
        var deviceName=string.IsNullOrWhiteSpace(Environment.MachineName)?"PC do aluno":Environment.MachineName.Trim();
        if(deviceName.Length>80)deviceName=deviceName[..80];

        var payload=CanonicalPayload(
            identity.DeviceId,identity.PublicKeyFingerprint,PairingProofFactory.AgentVersion,
            deviceName,code,expiresAt,nonce);

        return new MentorProof(
            1,PairingProofFactory.AgentVersion,identity.DeviceId,deviceName,
            identity.PublicKeyPem,identity.PublicKeyFingerprint,code,expiresAt,nonce,
            AgentIdentityStore.SignBase64(payload));
    }

    public static string CanonicalPayload(
        string deviceId,string fingerprint,string agentVersion,string deviceName,
        string code,DateTimeOffset expiresAt,string nonce)=>
        string.Join("\n",
            "devinx-laser-mentor-v1",
            deviceId,fingerprint,agentVersion,deviceName,code,
            expiresAt.ToUnixTimeSeconds().ToString(),nonce);

    private static string RandomCode(int length)
    {
        var bytes=RandomNumberGenerator.GetBytes(length);
        var chars=new char[length];
        for(var i=0;i<length;i++)chars[i]=Alphabet[bytes[i]%Alphabet.Length];
        return new string(chars);
    }
}
