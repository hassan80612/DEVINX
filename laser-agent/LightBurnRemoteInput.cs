using System.Runtime.InteropServices;

namespace DevinXLaserAgent;

internal static class LightBurnRemoteInput
{
    private const uint InputMouse=0;
    private const uint InputKeyboard=1;

    private const uint MouseeventfLeftDown=0x0002;
    private const uint MouseeventfLeftUp=0x0004;
    private const uint MouseeventfRightDown=0x0008;
    private const uint MouseeventfRightUp=0x0010;
    private const uint MouseeventfWheel=0x0800;

    private const uint KeyeventfKeyup=0x0002;
    private const uint KeyeventfUnicode=0x0004;
    private const uint WmMouseMove=0x0200;
    private const uint WmLButtonDown=0x0201;
    private const uint WmLButtonUp=0x0202;
    private const uint WmLButtonDblClk=0x0203;
    private const uint WmRButtonDown=0x0204;
    private const uint WmRButtonUp=0x0205;
    private const uint MkLButton=0x0001;
    private const uint MkRButton=0x0002;
    private const uint GaRoot=2;
    private const uint SwpNoMove=0x0002;
    private const uint SwpNoSize=0x0001;
    private const uint SwpShowWindow=0x0040;
    private static readonly IntPtr HwndTop=IntPtr.Zero;

    [StructLayout(LayoutKind.Sequential)]
    private struct Point
    {
        public int X;
        public int Y;
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

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public MouseInput mi;
        [FieldOffset(0)] public KeyboardInput ki;
        [FieldOffset(0)] public HardwareInput hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Input
    {
        public uint type;
        public InputUnion U;
    }

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr SetFocus(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool BringWindowToTop(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd,int nCmdShow);

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    private static extern bool AttachThreadInput(uint idAttach,uint idAttachTo,bool fAttach);

    private const int SwRestore=9;

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd,out uint processId);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc,IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int x,int y);

    [DllImport("user32.dll")]
    private static extern IntPtr WindowFromPoint(Point point);

    [DllImport("user32.dll")]
    private static extern IntPtr GetAncestor(IntPtr hWnd,uint gaFlags);

    [DllImport("user32.dll")]
    private static extern bool ScreenToClient(IntPtr hWnd,ref Point point);

    [DllImport("user32.dll",SetLastError=true)]
    private static extern bool PostMessage(IntPtr hWnd,uint msg,IntPtr wParam,IntPtr lParam);

    [DllImport("user32.dll",SetLastError=true)]
    private static extern bool SetWindowPos(
        IntPtr hWnd,IntPtr hWndInsertAfter,int x,int y,int cx,int cy,uint uFlags);

    [DllImport("user32.dll",SetLastError=true)]
    private static extern uint SendInput(uint nInputs,Input[] pInputs,int cbSize);

    private delegate bool EnumWindowsProc(IntPtr hWnd,IntPtr lParam);

    public static RemoteInputApplyResult Apply(RealtimeRemoteInput input)
    {
        if(!OperatingSystem.IsWindows())return new(false,"windows_required",null,null);

        var main=LightBurnWindowCapture.FindLightBurnWindow();
        if(main==IntPtr.Zero)return new(false,"lightburn_window_not_found",null,null);

        try
        {
            return input.Type switch
            {
                "pointermove"=>MovePointer(main,input),
                "pointerdown"=>PointerButton(main,input,true),
                "pointerup"=>PointerButton(main,input,false),
                "doubleclick"=>DoubleClick(main,input),
                "wheel"=>Wheel(main,input),
                "keydown"=>Keyboard(main,input,true),
                "keyup"=>Keyboard(main,input,false),
                "text"=>Text(main,input.Key),
                _=>new(false,"unsupported_input",null,null)
            };
        }
        catch(Exception ex)
        {
            return new(false,"input_error:"+ex.GetType().Name,null,null);
        }
    }

    public static bool FocusLightBurn()
    {
        var main=LightBurnWindowCapture.FindLightBurnWindow();
        if(main==IntPtr.Zero)return false;
        return ActivateWindow(FindInteractiveWindow(main));
    }

    // Compatibility shim for older Agent code paths. Session control must never
    // pin LightBurn above the user's other applications.
    public static bool SetSessionLock(bool enabled)=>true;

    private static RemoteInputApplyResult MovePointer(IntPtr main,RealtimeRemoteInput input)
    {
        if(!TryScreenPoint(main,input,out var x,out var y))
            return new(false,"invalid_coordinates",x,y);

        if(!SetCursorPos(x,y))
            return new(false,"cursor_move_failed",x,y);

        return new(true,"cursor_moved",x,y);
    }

    private static RemoteInputApplyResult PointerButton(IntPtr main,RealtimeRemoteInput input,bool down)
    {
        if(!TryScreenPoint(main,input,out var x,out var y))
            return new(false,"invalid_coordinates",x,y);

        if(!EnsureLightBurnAtPoint(main,x,y,out var target,out var reason))
            return new(false,reason,x,y);

        var right=input.Button==2;
        var flag=right
            ?(down?MouseeventfRightDown:MouseeventfRightUp)
            :(down?MouseeventfLeftDown:MouseeventfLeftUp);

        if(SendMouse(flag,0))
            return new(true,"sendinput",x,y);

        var msg=right
            ?(down?WmRButtonDown:WmRButtonUp)
            :(down?WmLButtonDown:WmLButtonUp);
        var keyState=down?(right?MkRButton:MkLButton):0u;

        return PostPointer(target,msg,keyState,x,y)
            ?new(true,"postmessage_fallback",x,y)
            :new(false,"windows_mouse_injection_failed",x,y);
    }

    private static RemoteInputApplyResult DoubleClick(IntPtr main,RealtimeRemoteInput input)
    {
        if(!TryScreenPoint(main,input,out var x,out var y))
            return new(false,"invalid_coordinates",x,y);

        if(!EnsureLightBurnAtPoint(main,x,y,out var target,out var reason))
            return new(false,reason,x,y);

        var inputs=new[]
        {
            Mouse(MouseeventfLeftDown,0),
            Mouse(MouseeventfLeftUp,0),
            Mouse(MouseeventfLeftDown,0),
            Mouse(MouseeventfLeftUp,0)
        };
        if(SendInput((uint)inputs.Length,inputs,Marshal.SizeOf<Input>())==inputs.Length)
            return new(true,"sendinput_double",x,y);

        var ok=PostPointer(target,WmLButtonDown,MkLButton,x,y)
               &&PostPointer(target,WmLButtonUp,0,x,y)
               &&PostPointer(target,WmLButtonDblClk,MkLButton,x,y)
               &&PostPointer(target,WmLButtonUp,0,x,y);
        return ok
            ?new(true,"postmessage_double_fallback",x,y)
            :new(false,"windows_doubleclick_injection_failed",x,y);
    }

    private static RemoteInputApplyResult Wheel(IntPtr main,RealtimeRemoteInput input)
    {
        if(!TryScreenPoint(main,input,out var x,out var y))
            return new(false,"invalid_coordinates",x,y);

        if(!EnsureLightBurnAtPoint(main,x,y,out _,out var reason))
            return new(false,reason,x,y);

        var delta=(int)Math.Round(-input.DeltaY);
        delta=Math.Clamp(delta,-120,120);
        if(delta==0)delta=input.DeltaY>0?-120:120;
        return SendMouse(MouseeventfWheel,unchecked((uint)delta))
            ?new(true,"sendinput_wheel",x,y)
            :new(false,"windows_wheel_injection_failed",x,y);
    }

    private static RemoteInputApplyResult Keyboard(IntPtr main,RealtimeRemoteInput input,bool down)
    {
        var target=FindInteractiveWindow(main);
        ActivateWindow(target);

        var vk=VirtualKey(input.Code,input.Key);
        if(vk==0)return new(false,"unsupported_key",null,null);

        var list=new List<Input>();
        if(down)
        {
            if(input.Ctrl)list.Add(Key(0x11,false));
            if(input.Shift)list.Add(Key(0x10,false));
            if(input.Alt)list.Add(Key(0x12,false));
        }

        list.Add(Key((ushort)vk,!down));

        if(!down)
        {
            if(input.Alt)list.Add(Key(0x12,true));
            if(input.Shift)list.Add(Key(0x10,true));
            if(input.Ctrl)list.Add(Key(0x11,true));
        }

        var inputs=list.ToArray();
        return SendInput((uint)inputs.Length,inputs,Marshal.SizeOf<Input>())==inputs.Length
            ?new(true,"sendinput_key",null,null)
            :new(false,"windows_key_injection_failed",null,null);
    }

    private static RemoteInputApplyResult Text(IntPtr main,string? text)
    {
        if(string.IsNullOrEmpty(text))return new(false,"empty_text",null,null);

        var target=FindInteractiveWindow(main);
        ActivateWindow(target);

        var inputs=new List<Input>();
        foreach(var ch in text.Take(256))
        {
            inputs.Add(Unicode(ch,false));
            inputs.Add(Unicode(ch,true));
        }

        var array=inputs.ToArray();
        return SendInput((uint)array.Length,array,Marshal.SizeOf<Input>())==array.Length
            ?new(true,"sendinput_text",null,null)
            :new(false,"windows_text_injection_failed",null,null);
    }

    private static bool EnsureLightBurnAtPoint(
        IntPtr main,int x,int y,out IntPtr target,out string reason)
    {
        target=IntPtr.Zero;
        reason="target_not_lightburn";

        LightBurnWindowCapture.TryGetInteractionBounds(main,out var preferred,
            out _,out _,out _,out _);
        if(preferred==IntPtr.Zero)preferred=main;
        ActivateWindow(preferred);
        SetWindowPos(preferred,HwndTop,0,0,0,0,SwpNoMove|SwpNoSize|SwpShowWindow);
        SetCursorPos(x,y);
        Thread.Sleep(35);

        for(var attempt=0;attempt<2;attempt++)
        {
            var hit=WindowFromPoint(new Point{X=x,Y=y});
            if(hit!=IntPtr.Zero&&BelongsToLightBurn(main,hit))
            {
                target=hit;
                return true;
            }

            if(hit!=IntPtr.Zero)
            {
                var root=GetAncestor(hit,GaRoot);
                if(root!=IntPtr.Zero&&BelongsToLightBurn(main,root))
                {
                    target=hit;
                    return true;
                }
            }

            ActivateWindow(preferred);
            SetWindowPos(preferred,HwndTop,0,0,0,0,SwpNoMove|SwpNoSize|SwpShowWindow);
            SetCursorPos(x,y);
            Thread.Sleep(45);
        }

        return false;
    }

    private static bool BelongsToLightBurn(IntPtr main,IntPtr candidate)
    {
        if(main==IntPtr.Zero||candidate==IntPtr.Zero)return false;
        GetWindowThreadProcessId(main,out var mainPid);
        GetWindowThreadProcessId(candidate,out var candidatePid);
        if(mainPid!=0&&candidatePid==mainPid)return true;

        var root=GetAncestor(candidate,GaRoot);
        if(root==IntPtr.Zero)return false;
        GetWindowThreadProcessId(root,out var rootPid);
        return mainPid!=0&&rootPid==mainPid;
    }

    private static bool PostPointer(IntPtr target,uint message,uint keyState,int screenX,int screenY)
    {
        if(target==IntPtr.Zero)return false;
        var point=new Point{X=screenX,Y=screenY};
        if(!ScreenToClient(target,ref point))return false;
        var packed=(point.Y<<16)|(point.X&0xFFFF);
        return PostMessage(target,message,(IntPtr)keyState,(IntPtr)packed);
    }

    private static bool TryScreenPoint(IntPtr main,RealtimeRemoteInput input,out int x,out int y)
    {
        x=y=0;
        if(!input.X.HasValue||!input.Y.HasValue)return false;
        if(!LightBurnWindowCapture.TryGetInteractionBounds(main,out _,out var left,out var top,out var width,out var height))
            return false;

        x=left+Math.Clamp((int)Math.Round(Math.Clamp(input.X.Value,0,1)*(width-1)),0,width-1);
        y=top+Math.Clamp((int)Math.Round(Math.Clamp(input.Y.Value,0,1)*(height-1)),0,height-1);
        return true;
    }

    private static bool ActivateWindow(IntPtr target)
    {
        if(target==IntPtr.Zero)return false;
        if(IsIconic(target))ShowWindow(target,SwRestore);

        var currentThread=GetCurrentThreadId();
        var foreground=GetForegroundWindow();
        var foregroundThread=foreground==IntPtr.Zero?0:GetWindowThreadProcessId(foreground,out _);
        var targetThread=GetWindowThreadProcessId(target,out _);

        var attachedForeground=false;
        var attachedTarget=false;
        try
        {
            if(foregroundThread!=0&&foregroundThread!=currentThread)
                attachedForeground=AttachThreadInput(currentThread,foregroundThread,true);
            if(targetThread!=0&&targetThread!=currentThread&&targetThread!=foregroundThread)
                attachedTarget=AttachThreadInput(currentThread,targetThread,true);

            BringWindowToTop(target);
            var foregroundSet=SetForegroundWindow(target);
            SetFocus(target);
            return foregroundSet||GetForegroundWindow()==target;
        }
        finally
        {
            if(attachedTarget)AttachThreadInput(currentThread,targetThread,false);
            if(attachedForeground)AttachThreadInput(currentThread,foregroundThread,false);
        }
    }

    private static IntPtr FindInteractiveWindow(IntPtr main)
    {
        GetWindowThreadProcessId(main,out var mainPid);
        if(mainPid==0)return main;

        var foreground=GetForegroundWindow();
        if(foreground!=IntPtr.Zero)
        {
            GetWindowThreadProcessId(foreground,out var foregroundPid);
            if(foregroundPid==mainPid)return foreground;
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

    private static bool SendMouse(uint flags,uint data)
    {
        var input=Mouse(flags,data);
        return SendInput(1,[input],Marshal.SizeOf<Input>())==1;
    }

    private static Input Mouse(uint flags,uint data)=>new()
    {
        type=InputMouse,
        U=new InputUnion
        {
            mi=new MouseInput{dwFlags=flags,mouseData=data}
        }
    };

    private static Input Key(ushort key,bool up)=>new()
    {
        type=InputKeyboard,
        U=new InputUnion
        {
            ki=new KeyboardInput{wVk=key,dwFlags=up?KeyeventfKeyup:0}
        }
    };

    private static Input Unicode(char ch,bool up)=>new()
    {
        type=InputKeyboard,
        U=new InputUnion
        {
            ki=new KeyboardInput
            {
                wVk=0,
                wScan=ch,
                dwFlags=KeyeventfUnicode|(up?KeyeventfKeyup:0)
            }
        }
    };

    private static int VirtualKey(string? code,string? key)
    {
        if(!string.IsNullOrWhiteSpace(code))
        {
            if(code.StartsWith("Key",StringComparison.Ordinal)&&code.Length==4)
                return char.ToUpperInvariant(code[3]);
            if(code.StartsWith("Digit",StringComparison.Ordinal)&&code.Length==6)
                return code[5];
            if(code.StartsWith("F",StringComparison.Ordinal)
               &&int.TryParse(code.AsSpan(1),out var f)&&f is>=1 and<=24)
                return 0x70+(f-1);

            return code switch
            {
                "Enter"=>0x0D,"Escape"=>0x1B,"Backspace"=>0x08,"Tab"=>0x09,
                "Space"=>0x20,"Delete"=>0x2E,"Insert"=>0x2D,
                "ArrowLeft"=>0x25,"ArrowUp"=>0x26,"ArrowRight"=>0x27,"ArrowDown"=>0x28,
                "Home"=>0x24,"End"=>0x23,"PageUp"=>0x21,"PageDown"=>0x22,
                "Pause"=>0x13,"ControlLeft"=>0x11,"ControlRight"=>0x11,
                "ShiftLeft"=>0x10,"ShiftRight"=>0x10,"AltLeft"=>0x12,"AltRight"=>0x12,
                _=>0
            };
        }

        if(!string.IsNullOrEmpty(key)&&key.Length==1)
            return char.ToUpperInvariant(key[0]);
        return 0;
    }
}


internal sealed record RemoteInputApplyResult(bool Ok,string Reason,int? X,int? Y);
