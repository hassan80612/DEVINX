namespace DevinXLaserAgent;

internal static class AgentLocalState
{
    private static readonly string DirectoryPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "DevinXLaserAgent");

    public static void ResetAll()
    {
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("The Agent is Windows-only.");

        StartupRegistration.Remove();

        if (!Directory.Exists(DirectoryPath))return;

        Directory.Delete(DirectoryPath, recursive:true);
    }
}
