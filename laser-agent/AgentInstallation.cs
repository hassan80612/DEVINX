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
                Path.GetFullPath(current),
                Path.GetFullPath(InstalledExe),
                StringComparison.OrdinalIgnoreCase);
        }
    }

    public static bool TryInstallAndRelaunch(string[] args)
    {
        if(AgentDistribution.IsStoreBuild)return false;
        if(!OperatingSystem.IsWindows()||IsInstalledCopy)return false;
        if(args.Any(a=>a.StartsWith("--",StringComparison.OrdinalIgnoreCase)))return false;

        var current=Environment.ProcessPath;
        if(string.IsNullOrWhiteSpace(current)||!File.Exists(current))return false;

        try
        {
            Directory.CreateDirectory(InstallDirectory);
            StopInstalledCopyIfRunning();

            var staged=Path.Combine(InstallDirectory,"DevinXLaserAgent.new.exe");
            File.Copy(current,staged,overwrite:true);

            if(File.Exists(InstalledExe))
            {
                try{File.Delete(InstalledExe);}
                catch
                {
                    MoveFileEx(InstalledExe,null,MovefileDelayUntilReboot);
                    return false;
                }
            }

            File.Move(staged,InstalledExe,overwrite:true);

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

    private static void StopInstalledCopyIfRunning()
    {
        foreach(var process in Process.GetProcessesByName("DevinXLaserAgent"))
        {
            try
            {
                if(process.Id==Environment.ProcessId)continue;
                var path=process.MainModule?.FileName;
                if(string.IsNullOrWhiteSpace(path)
                   ||!string.Equals(Path.GetFullPath(path),Path.GetFullPath(InstalledExe),StringComparison.OrdinalIgnoreCase))
                    continue;

                process.Kill(entireProcessTree:true);
                process.WaitForExit(3_000);
            }
            catch{}
            finally{process.Dispose();}
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

        if(AgentDistribution.IsStoreBuild)
        {
            // Package files are owned by Windows. Never copy or delete them.
            try{Process.Start(new ProcessStartInfo("ms-settings:appsfeatures"){UseShellExecute=true});}
            catch{}
            return;
        }

        if(!IsInstalledCopy)return;

        try
        {
            foreach(var file in Directory.EnumerateFiles(InstallDirectory))
            {
                try
                {
                    File.Delete(file);
                    if(File.Exists(file))
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
