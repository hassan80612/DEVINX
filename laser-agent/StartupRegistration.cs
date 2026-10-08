using Microsoft.Win32;

namespace DevinXLaserAgent;

internal static class StartupRegistration
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "DevinXLaserAgent";

    public static void EnsureRegistered()
    {
        // The MSIX manifest owns startup registration; respect the user's OS setting.
        if (AgentDistribution.IsStoreBuild) return;
        if (!OperatingSystem.IsWindows()) return;

        var exe = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(exe)) return;

        using var key = Registry.CurrentUser.OpenSubKey(RunKey, writable:true)
            ?? Registry.CurrentUser.CreateSubKey(RunKey, writable:true);

        var desired = $"\"{exe}\" --background";
        var current = key.GetValue(ValueName) as string;
        if (!string.Equals(current, desired, StringComparison.OrdinalIgnoreCase))
            key.SetValue(ValueName, desired, RegistryValueKind.String);
    }

    public static void Remove()
    {
        if (AgentDistribution.IsStoreBuild) return;
        if (!OperatingSystem.IsWindows()) return;
        using var key = Registry.CurrentUser.OpenSubKey(RunKey, writable:true);
        key?.DeleteValue(ValueName, throwOnMissingValue:false);
    }
}
