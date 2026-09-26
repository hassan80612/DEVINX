using System.Security.Cryptography;
using System.Text;

namespace DevinXLaserAgent;

internal static class SecureSecretStore
{
    private static readonly string DirectoryPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "DevinXLaserAgent");

    private static readonly string SecretPath = Path.Combine(DirectoryPath, "lightburn-rest.secret");
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("DevinX-Laser-Agent-LightBurn-v1");

    public static bool Exists => File.Exists(SecretPath);

    public static void Save(string secret)
    {
        if (!OperatingSystem.IsWindows())throw new PlatformNotSupportedException("The Agent is Windows-only.");
        Directory.CreateDirectory(DirectoryPath);
        var clear = Encoding.UTF8.GetBytes(secret);
        var encrypted = ProtectedData.Protect(clear, Entropy, DataProtectionScope.CurrentUser);
        File.WriteAllBytes(SecretPath, encrypted);
        CryptographicOperations.ZeroMemory(clear);
    }

    public static string? Load()
    {
        if (!OperatingSystem.IsWindows())return null;
        if (!File.Exists(SecretPath))return null;
        var encrypted = File.ReadAllBytes(SecretPath);
        var clear = ProtectedData.Unprotect(encrypted, Entropy, DataProtectionScope.CurrentUser);
        try { return Encoding.UTF8.GetString(clear); }
        finally { CryptographicOperations.ZeroMemory(clear); }
    }

    public static void Delete()
    {
        if (File.Exists(SecretPath))File.Delete(SecretPath);
    }
}
