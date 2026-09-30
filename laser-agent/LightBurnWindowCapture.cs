using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace DevinXLaserAgent;

internal sealed record CapturedPreview(byte[] Jpeg,int Width,int Height,DateTimeOffset CapturedAtUtc);

internal static class LightBurnWindowCapture
{
    [StructLayout(LayoutKind.Sequential)]
    private struct Rect{public int Left,Top,Right,Bottom;}

    private const int DwmwaExtendedFrameBounds=9;
    private const uint PwRenderFullContent=0x00000002;
    private const int MaxJpegBytes=90_000;
    private static IntPtr _lastDialog=IntPtr.Zero;
    private static readonly object LastCaptureGate=new();
    private static IntPtr _lastCapturedTarget=IntPtr.Zero;
    private static int _lastCapturedLeft;
    private static int _lastCapturedTop;
    private static int _lastCapturedWidth;
    private static int _lastCapturedHeight;
    private static DateTimeOffset _lastCapturedAtUtc=DateTimeOffset.MinValue;

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(
        IntPtr hwnd,int dwAttribute,out Rect pvAttribute,int cbAttribute);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd,out Rect rect);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd,out uint processId);

    private delegate bool EnumWindowsProc(IntPtr hWnd,IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc,IntPtr lParam);

    [DllImport("user32.dll",SetLastError=true)]
    private static extern bool PrintWindow(IntPtr hWnd,IntPtr hdcBlt,uint nFlags);

    public static CapturedPreview? TryCapture()
    {
        if(!OperatingSystem.IsWindows())return null;

        var handle=FindLightBurnWindow();
        if(handle==IntPtr.Zero||IsIconic(handle)||!IsWindowVisible(handle))return null;

        // Always stream the full LightBurn window. Modal dialogs stay visible in
        // context instead of replacing the entire remote view.
        if(!TryGetPhysicalBounds(handle,out var left,out var top,out var width,out var height))return null;
        if(width<200||height<150||width>10000||height>10000)return null;

        using var source=new Bitmap(width,height,PixelFormat.Format24bppRgb);
        var foreground=GetForegroundWindow();
        var sameProcess=BelongsToSameProcess(handle,foreground);

        try
        {
            if(sameProcess)
            {
                using var graphics=Graphics.FromImage(source);
                // CopyFromScreen includes the active LightBurn modal exactly where
                // it appears over the main window.
                graphics.CopyFromScreen(left,top,0,0,new Size(width,height),CopyPixelOperation.SourceCopy);
            }
            else
            {
                // Keep LightBurn capturable when the student uses another app.
                // Print the main HWND, then composite an active LightBurn dialog
                // back into its real screen position when one exists.
                if(!PrintWindowInto(source,handle))return null;
                OverlayActiveDialog(handle,source,left,top);
            }
        }
        catch{return null;}

        var encoded=EncodeAdaptive(source);
        if(encoded is null)return null;
        var capturedAt=DateTimeOffset.UtcNow;
        lock(LastCaptureGate)
        {
            _lastCapturedTarget=handle;
            _lastCapturedLeft=left;
            _lastCapturedTop=top;
            _lastCapturedWidth=width;
            _lastCapturedHeight=height;
            _lastCapturedAtUtc=capturedAt;
        }
        return new CapturedPreview(encoded.Value.Bytes,encoded.Value.Width,encoded.Value.Height,capturedAt);
    }

    private static bool PrintWindowInto(Bitmap target,IntPtr handle)
    {
        using var graphics=Graphics.FromImage(target);
        var hdc=graphics.GetHdc();
        try{return PrintWindow(handle,hdc,PwRenderFullContent);}
        finally{graphics.ReleaseHdc(hdc);}
    }

    private static void OverlayActiveDialog(IntPtr main,Bitmap target,int mainLeft,int mainTop)
    {
        if(!TryGetInteractionBounds(main,out var dialog,
            out var left,out var top,out var width,out var height)
           ||dialog==main||width<100||height<70)
            return;

        using var dialogBitmap=new Bitmap(width,height,PixelFormat.Format24bppRgb);
        if(!PrintWindowInto(dialogBitmap,dialog))return;

        using var graphics=Graphics.FromImage(target);
        graphics.DrawImageUnscaled(dialogBitmap,left-mainLeft,top-mainTop);
    }

    private static (byte[] Bytes,int Width,int Height)? EncodeAdaptive(Bitmap source)
    {
        // Prefer smaller, faster frames. LightBurn is mostly high-contrast UI, so
        // this remains readable while substantially reducing upload time.
        foreach(var width in new[]{1280,1120,960,840,720})
        {
            Bitmap? resized=null;
            Bitmap output=source;
            if(source.Width>width)
            {
                var scale=(double)width/source.Width;
                var targetHeight=Math.Max(1,(int)Math.Round(source.Height*scale));
                resized=new Bitmap(width,targetHeight,PixelFormat.Format24bppRgb);
                using var g=Graphics.FromImage(resized);
                g.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBilinear;
                g.DrawImage(source,0,0,width,targetHeight);
                output=resized;
            }

            try
            {
                foreach(var quality in new long[]{55,48,42,36,30})
                {
                    var bytes=EncodeJpeg(output,quality);
                    if(bytes.Length is>=100 and<=MaxJpegBytes)
                        return (bytes,output.Width,output.Height);
                }
            }
            finally{resized?.Dispose();}

            if(source.Width<=width)break;
        }

        return null;
    }

    private static byte[] EncodeJpeg(Bitmap bitmap,long quality)
    {
        using var stream=new MemoryStream();
        var codec=ImageCodecInfo.GetImageEncoders().First(x=>x.FormatID==ImageFormat.Jpeg.Guid);
        using var parameters=new EncoderParameters(1);
        parameters.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,quality);
        bitmap.Save(stream,codec,parameters);
        return stream.ToArray();
    }

    public static bool TryGetLastCapturedBounds(
        IntPtr main,out IntPtr target,
        out int left,out int top,out int width,out int height)
    {
        target=IntPtr.Zero;
        left=top=width=height=0;
        lock(LastCaptureGate)
        {
            if(_lastCapturedTarget==IntPtr.Zero
               ||DateTimeOffset.UtcNow-_lastCapturedAtUtc>TimeSpan.FromSeconds(2))
                return false;
            target=_lastCapturedTarget;
            left=_lastCapturedLeft;
            top=_lastCapturedTop;
            width=_lastCapturedWidth;
            height=_lastCapturedHeight;
        }
        return IsWindow(target)&&IsWindowVisible(target)&&!IsIconic(target)
            &&BelongsToSameProcess(main,target)&&width>0&&height>0;
    }

    public static bool TryGetPhysicalBounds(
        IntPtr handle,
        out int left,
        out int top,
        out int width,
        out int height)
    {
        left=top=width=height=0;
        Rect rect;
        if(DwmGetWindowAttribute(
            handle,DwmwaExtendedFrameBounds,out rect,Marshal.SizeOf<Rect>())!=0)
        {
            if(!GetWindowRect(handle,out rect))return false;
        }

        width=rect.Right-rect.Left;
        height=rect.Bottom-rect.Top;
        left=rect.Left;
        top=rect.Top;
        return width>0&&height>0;
    }

    // Track the active LightBurn dialog for interaction/compositing while the
    // streamed coordinate space remains the full main LightBurn window.
    public static bool TryGetInteractionBounds(
        IntPtr main,out IntPtr target,
        out int left,out int top,out int width,out int height)
    {
        target=main;
        if(!TryGetPhysicalBounds(main,out left,out top,out width,out height))return false;

        var foreground=GetForegroundWindow();
        if(foreground!=main&&IsWindow(foreground)
           &&BelongsToSameProcess(main,foreground)
           &&IsWindowVisible(foreground)&&!IsIconic(foreground))
            Interlocked.Exchange(ref _lastDialog,foreground);

        var dialog=Interlocked.CompareExchange(ref _lastDialog,IntPtr.Zero,IntPtr.Zero);
        if(dialog==main||!IsWindow(dialog)||!BelongsToSameProcess(main,dialog)
           ||!IsWindowVisible(dialog)||IsIconic(dialog))
        {
            Interlocked.Exchange(ref _lastDialog,IntPtr.Zero);
            return true;
        }
        if(!TryGetPhysicalBounds(dialog,out var dialogLeft,out var dialogTop,
            out var dialogWidth,out var dialogHeight)
           ||dialogWidth<100||dialogHeight<70)return true;

        target=dialog;
        left=dialogLeft;
        top=dialogTop;
        width=dialogWidth;
        height=dialogHeight;
        return true;
    }

    private static bool BelongsToSameProcess(IntPtr main,IntPtr candidate)
    {
        if(main==IntPtr.Zero||candidate==IntPtr.Zero)return false;
        GetWindowThreadProcessId(main,out var mainPid);
        GetWindowThreadProcessId(candidate,out var candidatePid);
        return mainPid!=0&&mainPid==candidatePid;
    }

    public static IntPtr FindLightBurnWindow()
    {
        foreach(var process in Process.GetProcesses())
        {
            try
            {
                var name=process.ProcessName;
                var title=process.MainWindowTitle;
                if(!name.Equals("LightBurn",StringComparison.OrdinalIgnoreCase)
                   &&!title.Contains("LightBurn",StringComparison.OrdinalIgnoreCase))
                    continue;

                var pid=(uint)process.Id;
                var preferred=process.MainWindowHandle;
                var largest=FindLargestVisibleWindow(pid);
                if(largest!=IntPtr.Zero)return largest;
                if(preferred!=IntPtr.Zero)return preferred;
            }
            catch{}
            finally{process.Dispose();}
        }
        return IntPtr.Zero;
    }

    private static IntPtr FindLargestVisibleWindow(uint processId)
    {
        IntPtr best=IntPtr.Zero;
        long bestArea=0;

        EnumWindows((window,_)=>{
            if(!IsWindowVisible(window)||IsIconic(window))return true;
            GetWindowThreadProcessId(window,out var pid);
            if(pid!=processId)return true;
            if(!TryGetPhysicalBounds(window,out _,out _,out var width,out var height))
                return true;
            if(width<300||height<200)return true;

            var area=(long)width*height;
            if(area>bestArea)
            {
                best=window;
                bestArea=area;
            }
            return true;
        },IntPtr.Zero);

        return best;
    }
}
