namespace DevinXLaserAgent;

internal static class AgentLocalState
{
    private static string DirectoryPath => AgentRuntime.StateDirectory;

    public static void ResetAll()
    {
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("The Agent is Windows-only.");

        if(!AgentRuntime.MentorMode)StartupRegistration.Remove();

        if (!Directory.Exists(DirectoryPath))return;

        Directory.Delete(DirectoryPath, recursive:true);
    }
}
