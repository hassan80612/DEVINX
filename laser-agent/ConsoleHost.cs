using System.Runtime.InteropServices;

namespace DevinXLaserAgent;

internal static class ConsoleHost
{
    private const uint AttachParentProcess=0xFFFFFFFF;

    [DllImport("kernel32.dll",SetLastError=true)]
    private static extern bool AttachConsole(uint processId);

    [DllImport("kernel32.dll",SetLastError=true)]
    private static extern bool AllocConsole();

    public static void AttachForTechnicalMode()
    {
        if(!OperatingSystem.IsWindows())return;

        if(!AttachConsole(AttachParentProcess))
            AllocConsole();

        try
        {
            Console.SetOut(new StreamWriter(Console.OpenStandardOutput()){AutoFlush=true});
            Console.SetError(new StreamWriter(Console.OpenStandardError()){AutoFlush=true});
            Console.SetIn(new StreamReader(Console.OpenStandardInput()));
            Console.Title="DevinX Laser Agent";
        }
        catch { }
    }
}
