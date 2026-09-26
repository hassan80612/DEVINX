using System.Diagnostics;
using System.Runtime.InteropServices;

namespace DevinXLaserAgent;

internal static class LightBurnCommandExecutor
{
    private const uint InputKeyboard=1;
    private const ushort VkControl=0x11;
    private const ushort VkShift=0x10;
    private const ushort VkPause=0x13;
    private const ushort VkCancel=0x03;
    private const ushort VkA=0x41;
    private const uint KeyeventfKeyup=0x0002;

    [StructLayout(LayoutKind.Sequential)]
    private struct Input
    {
        public uint type;
        public InputUnion U;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public KeyboardInput ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KeyboardInput
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern uint SendInput(uint nInputs, Input[] pInputs, int cbSize);

    public static async Task<CommandExecutionResult> ExecuteAsync(
        string command,
        LightBurnUdpClient udp,
        CancellationToken cancellationToken)
    {
        if (command == "start")
        {
            var reply = await udp.StartAsync(cancellationToken);
            if (!reply.Received) return new(false, "lightburn_no_reply");
            return reply.Response == "OK"
                ? new(true, null)
                : new(false, reply.Response == "!" ? "lightburn_rejected_start" : "lightburn_invalid_start");
        }

        var handle = FindLightBurnWindow();
        if (handle == IntPtr.Zero) return new(false, "lightburn_window_not_found");

        return command switch
        {
            "pause" => SendShortcut(handle, [VkPause]),
            "stop" => SendShortcut(handle, [VkControl, VkCancel]),
            "frame" => SendShortcut(handle, [VkControl, VkShift, VkA]),
            _ => new CommandExecutionResult(false, "unsupported_command")
        };
    }

    private static CommandExecutionResult SendShortcut(IntPtr handle, ushort[] keys)
    {
        var previous = GetForegroundWindow();
        SetForegroundWindow(handle);
        Thread.Sleep(45);

        var inputs = new List<Input>(keys.Length * 2);
        foreach (var key in keys) inputs.Add(Key(key, false));
        for (var i = keys.Length - 1; i >= 0; i--) inputs.Add(Key(keys[i], true));

        var sent = SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf<Input>());
        Thread.Sleep(45);

        if (previous != IntPtr.Zero && previous != handle) SetForegroundWindow(previous);
        return sent == inputs.Count
            ? new(true, null)
            : new(false, "windows_input_failed");
    }

    private static Input Key(ushort key, bool keyUp) => new()
    {
        type = InputKeyboard,
        U = new InputUnion
        {
            ki = new KeyboardInput
            {
                wVk = key,
                dwFlags = keyUp ? KeyeventfKeyup : 0
            }
        }
    };

    private static IntPtr FindLightBurnWindow()
    {
        foreach (var process in Process.GetProcesses())
        {
            try
            {
                if (process.MainWindowHandle == IntPtr.Zero) continue;
                if (process.ProcessName.Equals("LightBurn", StringComparison.OrdinalIgnoreCase)
                    || process.MainWindowTitle.Contains("LightBurn", StringComparison.OrdinalIgnoreCase))
                    return process.MainWindowHandle;
            }
            catch { }
            finally { process.Dispose(); }
        }
        return IntPtr.Zero;
    }
}

internal sealed record CommandExecutionResult(bool Ok, string? Reason);
