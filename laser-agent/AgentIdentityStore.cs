using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace DevinXLaserAgent;

internal sealed record AgentIdentity(string DeviceId, string PublicKeyPem, string PublicKeyFingerprint);

internal static class AgentIdentityStore
{
    private static readonly string DirectoryPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "DevinXLaserAgent");
    private static readonly string IdentityPath = Path.Combine(DirectoryPath, "agent-identity.json");
    private static readonly string PrivateKeyPath = Path.Combine(DirectoryPath, "agent-private-key.bin");
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("DevinX-Laser-Agent-Identity-v1");

    public static AgentIdentity GetOrCreate()
    {
        if (!OperatingSystem.IsWindows())throw new PlatformNotSupportedException("The Agent is Windows-only.");
        Directory.CreateDirectory(DirectoryPath);

        if (File.Exists(IdentityPath) && File.Exists(PrivateKeyPath))
        {
            var existing = JsonSerializer.Deserialize<AgentIdentity>(File.ReadAllText(IdentityPath));
            if (existing is not null)return existing;
        }

        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var publicKey = key.ExportSubjectPublicKeyInfo();
        var privateKey = key.ExportPkcs8PrivateKey();
        var encryptedPrivateKey = ProtectedData.Protect(privateKey, Entropy, DataProtectionScope.CurrentUser);
        CryptographicOperations.ZeroMemory(privateKey);

        var identity = new AgentIdentity(
            Guid.NewGuid().ToString("D"),
            PemEncoding.Write("PUBLIC KEY", publicKey),
            Convert.ToHexString(SHA256.HashData(publicKey)).ToLowerInvariant());

        File.WriteAllText(IdentityPath, JsonSerializer.Serialize(identity, new JsonSerializerOptions { WriteIndented = true }));
        File.WriteAllBytes(PrivateKeyPath, encryptedPrivateKey);
        return identity;
    }

    public static string SignBase64(string payload)
    {
        var encrypted = File.ReadAllBytes(PrivateKeyPath);
        var privateKey = ProtectedData.Unprotect(encrypted, Entropy, DataProtectionScope.CurrentUser);
        try
        {
            using var key = ECDsa.Create();
            key.ImportPkcs8PrivateKey(privateKey, out _);
            var signature = key.SignData(Encoding.UTF8.GetBytes(payload), HashAlgorithmName.SHA256);
            return Convert.ToBase64String(signature);
        }
        finally { CryptographicOperations.ZeroMemory(privateKey); }
    }
}
