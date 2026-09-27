namespace DevinXLaserAgent;

internal static class AgentPairingStateStore
{
    private static string DirectoryPath => AgentRuntime.StateDirectory;
    private static string PairingStatePath => Path.Combine(DirectoryPath, "paired-device.txt");

    public static bool IsPaired(string deviceId)
    {
        try
        {
            return File.Exists(PairingStatePath)
                && string.Equals(File.ReadAllText(PairingStatePath).Trim(), deviceId, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    public static void MarkPaired(string deviceId)
    {
        Directory.CreateDirectory(DirectoryPath);
        File.WriteAllText(PairingStatePath, deviceId);
    }
}
