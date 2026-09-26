using System.Security.Cryptography;

namespace DevinXLaserAgent;

internal sealed record PairingProof(
    string DeviceId,
    string PublicKeyPem,
    string PublicKeyFingerprint,
    string PairingCode,
    DateTimeOffset ExpiresAt,
    string Nonce,
    string SignatureBase64);

internal static class PairingProofFactory
{
    private static readonly char[] Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".ToCharArray();

    public static PairingProof Create(TimeSpan lifetime)
    {
        var identity = AgentIdentityStore.GetOrCreate();
        var expiresAt = DateTimeOffset.UtcNow.Add(lifetime);
        var nonce = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        var code = RandomCode(8);
        var payload = CanonicalPayload(identity.DeviceId, identity.PublicKeyFingerprint, code, expiresAt, nonce);
        var signature = AgentIdentityStore.SignBase64(payload);

        return new PairingProof(
            identity.DeviceId,
            identity.PublicKeyPem,
            identity.PublicKeyFingerprint,
            code,
            expiresAt,
            nonce,
            signature);
    }

    public static string CanonicalPayload(string deviceId,string fingerprint,string code,DateTimeOffset expiresAt,string nonce) =>
        string.Join("\n", "devinx-laser-pair-v1", deviceId, fingerprint, code, expiresAt.ToUnixTimeSeconds().ToString(), nonce);

    private static string RandomCode(int length)
    {
        var bytes = RandomNumberGenerator.GetBytes(length);
        var chars = new char[length];
        for (var i=0;i<length;i++)chars[i]=Alphabet[bytes[i]%Alphabet.Length];
        return new string(chars);
    }
}
