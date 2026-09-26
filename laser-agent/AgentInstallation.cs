using System.Diagnostics;
using System.Runtime.InteropServices;

namespace DevinXLaserAgent;

internal static class AgentInstallation
{
    private const int MovefileDelayUntilReboot=0x00000004;

    [DllImport("kernel32.dll",SetLastError=true,CharSet=CharSet.Unicode)]
    private static extern bool MoveFileEx(string existingFile,string? newFile,int flags);

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
            foreach(var file in Directory.EnumerateFiles(InstallDirectory))
            {
                try
                {
                    if(!File.Delete(file))
                        MoveFileEx(file,null,MovefileDelayUntilReboot);
                }
                catch
                {
                    MoveFileEx(file,null,MovefileDelayUntilReboot);
                }
            }
        }
        catch{}

        try{Directory.Delete(InstallDirectory,recursive:false);}
        catch{MoveFileEx(InstallDirectory,null,MovefileDelayUntilReboot);}
    }
}
