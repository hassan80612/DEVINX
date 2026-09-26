using System.Runtime.InteropServices;

namespace DevinXLaserAgent;

internal static class DpiAwareness
{
    private static readonly IntPtr PerMonitorAwareV2 = new(-4);

    [DllImport("user32.dll")]
    private static extern bool SetProcessDpiAwarenessContext(IntPtr value);

    public static void Initialize()
    {
        if(!OperatingSystem.IsWindows())return;
        try{SetProcessDpiAwarenessContext(PerMonitorAwareV2);}catch{}
    }
}
