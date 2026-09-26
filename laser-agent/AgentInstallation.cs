using System.Diagnostics;

namespace DevinXLaserAgent;

internal static class AgentInstallation
{
    public static readonly string InstallDirectory=Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Programs","DevinX Laser Agent");

    private static string InstalledExe=>Path.Combine(InstallDirectory,"DevinXLaserAgent.exe");

    public static bool IsInstalledCopy
    {
        get
        {
            var current=Environment.ProcessPath;
            if(string.IsNullOrWhiteSpace(current))return false;
            return string.Equals(
                Path.GetFullPath(Path.GetDirectoryName(current)??""),
                Path.GetFullPath(InstallDirectory),
                StringComparison.OrdinalIgnoreCase);
        }
    }

    public static bool TryInstallAndRelaunch(string[] args)
    {
        if(!OperatingSystem.IsWindows()||IsInstalledCopy)return false;
        if(args.Any(a=>a.StartsWith("--",StringComparison.OrdinalIgnoreCase)))return false;

        try
        {
            Directory.CreateDirectory(InstallDirectory);
            var sourceDirectory=AppContext.BaseDirectory;

            foreach(var source in Directory.EnumerateFiles(sourceDirectory))
            {
                var name=Path.GetFileName(source);
                if(name.Equals("README.md",StringComparison.OrdinalIgnoreCase))continue;
                if(name.Equals("LEIA-ME.txt",StringComparison.OrdinalIgnoreCase))continue;
                File.Copy(source,Path.Combine(InstallDirectory,name),overwrite:true);
            }

            if(!File.Exists(InstalledExe))return false;

            Process.Start(new ProcessStartInfo
            {
                FileName=InstalledExe,
                Arguments="--installed-launch",
                UseShellExecute=true,
                WorkingDirectory=InstallDirectory
            });
            return true;
        }
        catch
        {
            return false;
        }
    }

    public static void ScheduleRemoval()
    {
        try
        {
            StartupRegistration.Remove();
            AgentLocalState.ResetAll();
        }
        catch{}

        if(!IsInstalledCopy)return;

        try
        {
            var quoted=InstallDirectory.Replace(""","""");
            Process.Start(new ProcessStartInfo
            {
                FileName="cmd.exe",
                Arguments=$"/d /c "timeout /t 2 /nobreak >nul & rmdir /s /q \"{quoted}\""",
                UseShellExecute=false,
                CreateNoWindow=true,
                WindowStyle=ProcessWindowStyle.Hidden
            });
        }
        catch{}
    }
}
