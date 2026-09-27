using System.Runtime.InteropServices;

namespace DevinXLaserAgent;

internal static class ConsoleWindow
{
    private const int SwHide = 0;

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetConsoleWindow();

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    public static void Hide()
    {
        if (!OperatingSystem.IsWindows()) return;
        var handle = GetConsoleWindow();
        if (handle != IntPtr.Zero) ShowWindow(handle, SwHide);
    }
}
