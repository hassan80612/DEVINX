using System.Security.Cryptography;

namespace DevinXLaserAgent;

internal sealed record PairingProof(
    int Version,
    string AgentVersion,
    string DeviceId,
    string PublicKeyPem,
    string PublicKeyFingerprint,
    string PairingCode,
    DateTimeOffset ExpiresAt,
    string Nonce,
    string SignatureBase64);

internal static class PairingProofFactory
{
    public const string AgentVersion = "0.2.0";
    private static readonly char[] Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".ToCharArray();

    public static PairingProof Create(TimeSpan lifetime)
    {
        var identity = AgentIdentityStore.GetOrCreate();
        var expiresAt = DateTimeOffset.UtcNow.Add(lifetime);
        var nonce = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        var code = RandomCode(8);
        var payload = CanonicalPayload(identity.DeviceId, identity.PublicKeyFingerprint, AgentVersion, code, expiresAt, nonce);
        var signature = AgentIdentityStore.SignBase64(payload);

        return new PairingProof(
            1,
            AgentVersion,
            identity.DeviceId,
            identity.PublicKeyPem,
            identity.PublicKeyFingerprint,
            code,
            expiresAt,
            nonce,
            signature);
    }

    public static string CanonicalPayload(
        string deviceId,
        string fingerprint,
        string agentVersion,
        string code,
        DateTimeOffset expiresAt,
        string nonce) =>
        string.Join("\n",
            "devinx-laser-pair-v1",
            deviceId,
            fingerprint,
            agentVersion,
            code,
            expiresAt.ToUnixTimeSeconds().ToString(),
            nonce);

    private static string RandomCode(int length)
    {
        var bytes = RandomNumberGenerator.GetBytes(length);
        var chars = new char[length];
        for (var i=0;i<length;i++)chars[i]=Alphabet[bytes[i]%Alphabet.Length];
        return new string(chars);
    }
}
