using System.Diagnostics;
using System.Runtime.InteropServices;

namespace DevinXLaserAgent;

internal static class LightBurnRemoteInput
{
    private const uint WmMouseMove=0x0200;
    private const uint WmLButtonDown=0x0201;
    private const uint WmLButtonUp=0x0202;
    private const uint WmLButtonDblClk=0x0203;
    private const uint WmRButtonDown=0x0204;
    private const uint WmRButtonUp=0x0205;
    private const uint WmMouseWheel=0x020A;
    private const uint WmKeyDown=0x0100;
    private const uint WmKeyUp=0x0101;
    private const uint WmChar=0x0102;
    private const int MkLButton=0x0001;
    private const int MkRButton=0x0002;

    [StructLayout(LayoutKind.Sequential)]
    private struct Point{public int X;public int Y;}

    [StructLayout(LayoutKind.Sequential)]
    private struct GuiThreadInfo
    {
        public int cbSize;
        public int flags;
        public IntPtr hwndActive;
        public IntPtr hwndFocus;
        public IntPtr hwndCapture;
        public IntPtr hwndMenuOwner;
        public IntPtr hwndMoveSize;
        public IntPtr hwndCaret;
        public Rect rcCaret;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect{public int Left,Top,Right,Bottom;}

    [DllImport("user32.dll")]
    private static extern IntPtr WindowFromPoint(Point point);

    [DllImport("user32.dll")]
    private static extern bool ScreenToClient(IntPtr hWnd,ref Point point);

    [DllImport("user32.dll")]
    private static extern bool PostMessage(IntPtr hWnd,uint msg,IntPtr wParam,IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd,out uint processId);

    [DllImport("user32.dll")]
    private static extern bool GetGUIThreadInfo(uint idThread,ref GuiThreadInfo info);

    public static bool Apply(RealtimeRemoteInput input)
    {
        if(!OperatingSystem.IsWindows())return false;

        var main=LightBurnWindowCapture.FindLightBurnWindow();
        if(main==IntPtr.Zero)return false;

        return input.Type switch
        {
            "pointermove" => Mouse(main,input,WmMouseMove,0),
            "pointerdown" => Mouse(main,input,input.Button==2?WmRButtonDown:WmLButtonDown,input.Button==2?MkRButton:MkLButton),
            "pointerup" => Mouse(main,input,input.Button==2?WmRButtonUp:WmLButtonUp,0),
            "doubleclick" => Mouse(main,input,WmLButtonDblClk,MkLButton),
            "wheel" => Wheel(main,input),
            "keydown" => Keyboard(main,input,true),
            "keyup" => Keyboard(main,input,false),
            "text" => Text(main,input.Key),
            _ => false
        };
    }

    private static bool Mouse(IntPtr main,RealtimeRemoteInput input,uint message,int buttonMask)
    {
        if(!input.X.HasValue||!input.Y.HasValue)return false;
        if(!LightBurnWindowCapture.TryGetPhysicalBounds(main,out var left,out var top,out var width,out var height))
            return false;

        var nx=Math.Clamp(input.X.Value,0,1);
        var ny=Math.Clamp(input.Y.Value,0,1);
        var screen=new Point
        {
            X=left+Math.Clamp((int)Math.Round(nx*(width-1)),0,width-1),
            Y=top+Math.Clamp((int)Math.Round(ny*(height-1)),0,height-1)
        };

        var target=WindowFromPoint(screen);
        if(target==IntPtr.Zero||!BelongsToSameProcess(main,target))return false;

        var client=screen;
        if(!ScreenToClient(target,ref client))return false;
        var lParam=(IntPtr)((client.Y<<16)|(client.X&0xFFFF));
        return PostMessage(target,message,(IntPtr)buttonMask,lParam);
    }

    private static bool Wheel(IntPtr main,RealtimeRemoteInput input)
    {
        if(!input.X.HasValue||!input.Y.HasValue)return false;
        if(!LightBurnWindowCapture.TryGetPhysicalBounds(main,out var left,out var top,out var width,out var height))
            return false;

        var screen=new Point
        {
            X=left+Math.Clamp((int)Math.Round(Math.Clamp(input.X.Value,0,1)*(width-1)),0,width-1),
            Y=top+Math.Clamp((int)Math.Round(Math.Clamp(input.Y.Value,0,1)*(height-1)),0,height-1)
        };
        var target=WindowFromPoint(screen);
        if(target==IntPtr.Zero||!BelongsToSameProcess(main,target))return false;

        var delta=(short)Math.Clamp((int)Math.Round(-input.DeltaY),-120,120);
        if(delta==0)delta=(short)(input.DeltaY>0?-120:120);
        var wParam=(IntPtr)((delta&0xFFFF)<<16);
        var lParam=(IntPtr)((screen.Y<<16)|(screen.X&0xFFFF));
        return PostMessage(target,WmMouseWheel,wParam,lParam);
    }

    private static bool Keyboard(IntPtr main,RealtimeRemoteInput input,bool down)
    {
        var target=FocusedWindowFor(main);
        var vk=VirtualKey(input.Code,input.Key);
        if(vk==0)return false;

        var message=down?WmKeyDown:WmKeyUp;
        var ok=true;

        if(down)
        {
            if(input.Ctrl)ok&=PostMessage(target,WmKeyDown,(IntPtr)0x11,IntPtr.Zero);
            if(input.Shift)ok&=PostMessage(target,WmKeyDown,(IntPtr)0x10,IntPtr.Zero);
            if(input.Alt)ok&=PostMessage(target,WmKeyDown,(IntPtr)0x12,IntPtr.Zero);
        }

        ok&=PostMessage(target,message,(IntPtr)vk,IntPtr.Zero);

        if(!down)
        {
            if(input.Alt)ok&=PostMessage(target,WmKeyUp,(IntPtr)0x12,IntPtr.Zero);
            if(input.Shift)ok&=PostMessage(target,WmKeyUp,(IntPtr)0x10,IntPtr.Zero);
            if(input.Ctrl)ok&=PostMessage(target,WmKeyUp,(IntPtr)0x11,IntPtr.Zero);
        }

        return ok;
    }

    private static bool Text(IntPtr main,string? text)
    {
        if(string.IsNullOrEmpty(text))return false;
        var target=FocusedWindowFor(main);
        var ok=true;
        foreach(var ch in text.Take(16))
            ok&=PostMessage(target,WmChar,(IntPtr)ch,IntPtr.Zero);
        return ok;
    }

    private static IntPtr FocusedWindowFor(IntPtr main)
    {
        var thread=GetWindowThreadProcessId(main,out _);
        var info=new GuiThreadInfo{cbSize=Marshal.SizeOf<GuiThreadInfo>()};
        if(thread!=0&&GetGUIThreadInfo(thread,ref info)
           &&info.hwndFocus!=IntPtr.Zero
           &&BelongsToSameProcess(main,info.hwndFocus))
            return info.hwndFocus;
        return main;
    }

    private static bool BelongsToSameProcess(IntPtr main,IntPtr candidate)
    {
        GetWindowThreadProcessId(main,out var mainPid);
        GetWindowThreadProcessId(candidate,out var candidatePid);
        return mainPid!=0&&mainPid==candidatePid;
    }

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
