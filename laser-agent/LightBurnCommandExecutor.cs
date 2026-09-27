using System.Runtime.InteropServices;

namespace DevinXLaserAgent;

internal static class LightBurnCommandExecutor
{
    private const uint InputKeyboard=1;
    private const ushort VkControl=0x11;
    private const ushort VkPause=0x13;
    private const ushort VkF1=0x70;
    private const ushort VkEscape=0x1B;
    private const uint KeyeventfKeyup=0x0002;
    private static int _framingOpenedByAgent=0;

    [StructLayout(LayoutKind.Sequential)]
    private struct Input
    {
        public uint type;
        public InputUnion U;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public MouseInput mi;
        [FieldOffset(0)] public KeyboardInput ki;
        [FieldOffset(0)] public HardwareInput hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MouseInput
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
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

    [StructLayout(LayoutKind.Sequential)]
    private struct HardwareInput
    {
        public uint uMsg;
        public ushort wParamL;
        public ushort wParamH;
    }

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc,IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd,out uint processId);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    private delegate bool EnumWindowsProc(IntPtr hWnd,IntPtr lParam);

    [DllImport("user32.dll",SetLastError=true)]
    private static extern uint SendInput(uint nInputs,Input[] pInputs,int cbSize);

    [DllImport("user32.dll")]
    private static extern bool PostMessage(IntPtr hWnd,uint msg,IntPtr wParam,IntPtr lParam);

    public static async Task<CommandExecutionResult> ExecuteAsync(
        string command,
        LightBurnUdpClient udp,
        CancellationToken cancellationToken)
    {
        if(command=="start")
        {
            LightBurnRemoteInput.FocusLightBurn();
            var reply=await udp.StartAsync(cancellationToken);
            if(!reply.Received)return new(false,"lightburn_no_reply");
            return reply.Response=="OK"
                ?new(true,null)
                :new(false,reply.Response=="!"?"lightburn_rejected_start":"lightburn_invalid_start");
        }

        var handle=LightBurnWindowCapture.FindLightBurnWindow();
        if(handle==IntPtr.Zero)return new(false,"lightburn_window_not_found");

        return command switch
        {
            // Galvo/Fiber: F1 opens Live Framing. If it is already open,
            // Esc closes/stops the framing window instead of opening another one.
            "frame"=>ToggleGalvoFraming(handle),
            "pause"=>SendShortcut(handle,[VkPause]),
            "stop"=>SendShortcut(handle,[VkControl,VkPause]),
            _=>new CommandExecutionResult(false,"unsupported_command")
        };
    }

    private static CommandExecutionResult ToggleGalvoFraming(IntPtr main)
    {
        var opened=Volatile.Read(ref _framingOpenedByAgent)==1;
        if(!opened)
        {
            var result=SendShortcut(main,[VkF1]);
            if(result.Ok)Volatile.Write(ref _framingOpenedByAgent,1);
            return result;
        }

        var target=FindActiveLightBurnWindow(main);
        var close=SendShortcut(target,[VkEscape]);
        if(close.Ok)Volatile.Write(ref _framingOpenedByAgent,0);
        return close;
    }

    private static IntPtr FindActiveLightBurnWindow(IntPtr main)
    {
        GetWindowThreadProcessId(main,out var mainPid);
        var foreground=GetForegroundWindow();
        if(foreground!=IntPtr.Zero)
        {
            GetWindowThreadProcessId(foreground,out var foregroundPid);
            if(mainPid!=0&&foregroundPid==mainPid)return foreground;
        }

        IntPtr candidate=IntPtr.Zero;
        EnumWindows((window,_)=>{
            if(window==main||!IsWindowVisible(window))return true;
            GetWindowThreadProcessId(window,out var pid);
            if(pid==mainPid)
            {
                candidate=window;
                return false;
            }
            return true;
        },IntPtr.Zero);

        return candidate!=IntPtr.Zero?candidate:main;
    }

    private static CommandExecutionResult SendShortcut(IntPtr handle,ushort[] keys)
    {
        // The remote session owns LightBurn focus. Do not jump back to Chrome or
        // another window after issuing a laser command.
        SetForegroundWindow(handle);
        Thread.Sleep(55);

        var inputs=new List<Input>(keys.Length*2);
        foreach(var key in keys)inputs.Add(Key(key,false));
        for(var i=keys.Length-1;i>=0;i--)inputs.Add(Key(keys[i],true));

        var sent=SendInput((uint)inputs.Count,inputs.ToArray(),Marshal.SizeOf<Input>());
        Thread.Sleep(55);
        if(sent==inputs.Count)return new(true,null);

        var fallback=true;
        foreach(var key in keys)fallback&=PostMessage(handle,0x0100,(IntPtr)key,IntPtr.Zero);
        for(var i=keys.Length-1;i>=0;i--)fallback&=PostMessage(handle,0x0101,(IntPtr)keys[i],IntPtr.Zero);
        return fallback?new(true,null):new(false,"windows_input_failed");
    }

    private static Input Key(ushort key,bool keyUp)=>new()
    {
        type=InputKeyboard,
        U=new InputUnion
        {
            ki=new KeyboardInput
            {
                wVk=key,
                dwFlags=keyUp?KeyeventfKeyup:0
            }
        }
    };
}

internal sealed record CommandExecutionResult(bool Ok,string? Reason);
