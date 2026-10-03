using System.Runtime.InteropServices;

namespace DevinXLaserAgent;

/// <summary>
/// Remote input for the complete Windows desktop. Basic mouse/keyboard events
/// follow the currently focused application. LightBurn-specific shortcuts and
/// workspace actions remain explicitly routed through LightBurnRemoteInput.
/// </summary>
internal static class DesktopRemoteInput
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

    private static readonly object LastPointerSync=new();
    private static int? LastPointerX;
    private static int? LastPointerY;

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
    private static extern bool SetCursorPos(int x,int y);

    [DllImport("user32.dll",SetLastError=true)]
    private static extern uint SendInput(
        uint nInputs,Input[] pInputs,int cbSize);

    public static RemoteInputApplyResult Apply(RealtimeRemoteInput input)
    {
        if(!OperatingSystem.IsWindows())
            return new(false,"windows_required",null,null);

        try
        {
            return input.Type switch
            {
                "pointermove"=>MovePointer(input),
                "pointerdown"=>PointerButton(input,true),
                "pointerup"=>PointerButton(input,false),
                "click"=>Click(input),
                "doubleclick"=>DoubleClick(input),
                "wheel"=>Wheel(input),
                "keydown"=>Keyboard(input,true),
                "keyup"=>Keyboard(input,false),
                "text"=>Text(input.Key),
                "prepare_edit"=>PrepareEdit(),
                "replace_text"=>ReplaceFocusedText(input.Key),

                // Dedicated LightBurn actions preserve the old focus behavior
                // without forcing normal desktop typing back into LightBurn.
                "lightburnkeydown"=>LightBurnRemoteInput.Apply(
                    input with{Type="keydown"}),
                "lightburnkeyup"=>LightBurnRemoteInput.Apply(
                    input with{Type="keyup"}),
                "lightburntext"=>LightBurnRemoteInput.Apply(
                    input with{Type="text"}),
                "workspacekeydown"=>LightBurnRemoteInput.Apply(input),
                "workspacekeyup"=>LightBurnRemoteInput.Apply(input),
                _=>new(false,"unsupported_input",null,null)
            };
        }
        catch(Exception ex)
        {
            return new(false,"input_error:"+ex.GetType().Name,null,null);
        }
    }

    private static RemoteInputApplyResult MovePointer(RealtimeRemoteInput input)
    {
        if(!TryScreenPoint(input,out var x,out var y))
            return new(false,"invalid_coordinates",x,y);

        if(!SetCursorPos(x,y))
            return new(false,"cursor_move_failed",x,y);

        RememberPointer(x,y);
        return new(true,"desktop_cursor_moved",x,y);
    }

    private static RemoteInputApplyResult PointerButton(
        RealtimeRemoteInput input,bool down)
    {
        if(!TryScreenPoint(input,out var x,out var y))
            return new(false,"invalid_coordinates",x,y);
        if(!SetCursorPos(x,y))
            return new(false,"cursor_move_failed",x,y);

        RememberPointer(x,y);
        var right=input.Button==2;
        var flag=right
            ?(down?MouseeventfRightDown:MouseeventfRightUp)
            :(down?MouseeventfLeftDown:MouseeventfLeftUp);

        return SendMouse(flag,0)
            ?new(true,"desktop_sendinput",x,y)
            :new(false,"windows_mouse_injection_failed",x,y);
    }

    private static RemoteInputApplyResult Click(RealtimeRemoteInput input)
    {
        if(!TryScreenPoint(input,out var x,out var y))
            return new(false,"invalid_coordinates",x,y);
        if(!SetCursorPos(x,y))
            return new(false,"cursor_move_failed",x,y);

        RememberPointer(x,y);
        var right=input.Button==2;
        var inputs=right
            ?new[]{Mouse(MouseeventfRightDown,0),Mouse(MouseeventfRightUp,0)}
            :new[]{Mouse(MouseeventfLeftDown,0),Mouse(MouseeventfLeftUp,0)};

        return SendInput(
            (uint)inputs.Length,inputs,Marshal.SizeOf<Input>())==inputs.Length
            ?new(true,"desktop_click",x,y)
            :new(false,"windows_click_injection_failed",x,y);
    }

    private static RemoteInputApplyResult DoubleClick(RealtimeRemoteInput input)
    {
        if(!TryScreenPoint(input,out var x,out var y))
            return new(false,"invalid_coordinates",x,y);
        if(!SetCursorPos(x,y))
            return new(false,"cursor_move_failed",x,y);

        RememberPointer(x,y);
        var inputs=new[]
        {
            Mouse(MouseeventfLeftDown,0),
            Mouse(MouseeventfLeftUp,0),
            Mouse(MouseeventfLeftDown,0),
            Mouse(MouseeventfLeftUp,0)
        };

        return SendInput(
            (uint)inputs.Length,inputs,Marshal.SizeOf<Input>())==inputs.Length
            ?new(true,"desktop_doubleclick",x,y)
            :new(false,"windows_doubleclick_injection_failed",x,y);
    }

    private static RemoteInputApplyResult Wheel(RealtimeRemoteInput input)
    {
        if(!TryScreenPoint(input,out var x,out var y))
            return new(false,"invalid_coordinates",x,y);
        if(!SetCursorPos(x,y))
            return new(false,"cursor_move_failed",x,y);

        RememberPointer(x,y);
        var delta=(int)Math.Round(-input.DeltaY);
        delta=Math.Clamp(delta,-120,120);
        if(delta==0)delta=input.DeltaY>0?-120:120;

        return SendMouse(MouseeventfWheel,unchecked((uint)delta))
            ?new(true,"desktop_wheel",x,y)
            :new(false,"windows_wheel_injection_failed",x,y);
    }

    private static RemoteInputApplyResult Keyboard(
        RealtimeRemoteInput input,bool down)
    {
        var vk=VirtualKey(input.Code,input.Key);
        if(vk==0)return new(false,"unsupported_key",null,null);

        var list=new List<Input>();
        if(down)
        {
            if(input.Ctrl)list.Add(Key(0x11,false));
            if(input.Shift)list.Add(Key(0x10,false));
            if(input.Alt)list.Add(Key(0x12,false));
            if(input.Meta)list.Add(Key(0x5B,false));
        }

        list.Add(Key((ushort)vk,!down));

        if(!down)
        {
            if(input.Meta)list.Add(Key(0x5B,true));
            if(input.Alt)list.Add(Key(0x12,true));
            if(input.Shift)list.Add(Key(0x10,true));
            if(input.Ctrl)list.Add(Key(0x11,true));
        }

        var inputs=list.ToArray();
        return SendInput(
            (uint)inputs.Length,inputs,Marshal.SizeOf<Input>())==inputs.Length
            ?new(true,"desktop_key",null,null)
            :new(false,"windows_key_injection_failed",null,null);
    }

    private static RemoteInputApplyResult Text(string? text)
    {
        if(string.IsNullOrEmpty(text))
            return new(false,"empty_text",null,null);

        var inputs=new List<Input>();
        foreach(var ch in text.Take(256))
        {
            inputs.Add(Unicode(ch,false));
            inputs.Add(Unicode(ch,true));
        }

        var array=inputs.ToArray();
        return SendInput(
            (uint)array.Length,array,Marshal.SizeOf<Input>())==array.Length
            ?new(true,"desktop_text",null,null)
            :new(false,"windows_text_injection_failed",null,null);
    }

    private static RemoteInputApplyResult PrepareEdit()
    {
        int? x;
        int? y;
        lock(LastPointerSync)
        {
            x=LastPointerX;
            y=LastPointerY;
        }

        if(!x.HasValue||!y.HasValue)
            return new(true,"desktop_edit_focus_ready",null,null);

        SetCursorPos(x.Value,y.Value);
        var inputs=new[]
        {
            Mouse(MouseeventfLeftDown,0),
            Mouse(MouseeventfLeftUp,0),
            Mouse(MouseeventfLeftDown,0),
            Mouse(MouseeventfLeftUp,0)
        };
        var ok=SendInput(
            (uint)inputs.Length,inputs,Marshal.SizeOf<Input>())==inputs.Length;
        if(ok)Thread.Sleep(120);

        return ok
            ?new(true,"desktop_edit_target_prepared",x,y)
            :new(false,"edit_target_prepare_failed",x,y);
    }

    private static RemoteInputApplyResult ReplaceFocusedText(string? text)
    {
        if(text is null)return new(false,"empty_text",null,null);

        var inputs=new List<Input>
        {
            Key(0x11,false),
            Key((ushort)'A',false),
            Key((ushort)'A',true),
            Key(0x11,true)
        };

        if(text.Length==0)
        {
            inputs.Add(Key(0x08,false));
            inputs.Add(Key(0x08,true));
        }
        else
        {
            foreach(var ch in text.Take(256))
            {
                inputs.Add(Unicode(ch,false));
                inputs.Add(Unicode(ch,true));
            }
        }

        var array=inputs.ToArray();
        return SendInput(
            (uint)array.Length,array,Marshal.SizeOf<Input>())==array.Length
            ?new(true,"desktop_replace_text",null,null)
            :new(false,"windows_text_replace_failed",null,null);
    }

    private static bool TryScreenPoint(
        RealtimeRemoteInput input,out int x,out int y)
    {
        x=y=0;
        if(!input.X.HasValue||!input.Y.HasValue)return false;
        if(!DesktopCapture.TryGetLastCapturedBounds(
            out var left,out var top,out var width,out var height))
            return false;

        x=left+Math.Clamp(
            (int)Math.Round(Math.Clamp(input.X.Value,0,1)*(width-1)),
            0,width-1);
        y=top+Math.Clamp(
            (int)Math.Round(Math.Clamp(input.Y.Value,0,1)*(height-1)),
            0,height-1);
        return true;
    }

    private static void RememberPointer(int x,int y)
    {
        lock(LastPointerSync)
        {
            LastPointerX=x;
            LastPointerY=y;
        }
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
            ki=new KeyboardInput
            {
                wVk=key,
                dwFlags=up?KeyeventfKeyup:0
            }
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
                "MetaLeft"=>0x5B,"MetaRight"=>0x5C,
                _=>0
            };
        }

        if(!string.IsNullOrEmpty(key)&&key.Length==1)
            return char.ToUpperInvariant(key[0]);
        return 0;
    }
}
