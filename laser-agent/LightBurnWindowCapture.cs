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
    private const int MaxJpegBytes=165_000;

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
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd,out uint processId);

    [DllImport("user32.dll",SetLastError=true)]
    private static extern bool PrintWindow(IntPtr hWnd,IntPtr hdcBlt,uint nFlags);

    public static CapturedPreview? TryCapture()
    {
        if(!OperatingSystem.IsWindows())return null;

        var handle=FindLightBurnWindow();
        if(handle==IntPtr.Zero||IsIconic(handle)||!IsWindowVisible(handle))return null;
        if(!TryGetPhysicalBounds(handle,out var left,out var top,out var width,out var height))return null;
        if(width<200||height<150||width>10000||height>10000)return null;

        using var source=new Bitmap(width,height,PixelFormat.Format24bppRgb);
        var foreground=GetForegroundWindow();
        var sameProcess=BelongsToSameProcess(handle,foreground);

        try
        {
            using var graphics=Graphics.FromImage(source);

            if(sameProcess)
            {
                // Fast path: preserve the existing low-latency screen capture while
                // LightBurn (or one of its dialogs) is the foreground application.
                graphics.CopyFromScreen(left,top,0,0,new Size(width,height),CopyPixelOperation.SourceCopy);
            }
            else
            {
                // Background path: capture the LightBurn HWND itself instead of
                // whatever app the user is currently using. This avoids the DevinX
                // mirror loop without forcing LightBurn on top of the desktop.
                var hdc=graphics.GetHdc();
                try
                {
                    if(!PrintWindow(handle,hdc,PwRenderFullContent))return null;
                }
                finally{graphics.ReleaseHdc(hdc);}
            }
        }
        catch{return null;}

        var encoded=EncodeAdaptive(source);
        if(encoded is null)return null;
        return new CapturedPreview(encoded.Value.Bytes,encoded.Value.Width,encoded.Value.Height,DateTimeOffset.UtcNow);
    }

    private static (byte[] Bytes,int Width,int Height)? EncodeAdaptive(Bitmap source)
    {
        foreach(var width in new[]{1440,1280,1120,960})
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
                foreach(var quality in new long[]{58,50,43,36})
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
                if(process.MainWindowHandle!=IntPtr.Zero
                   &&(name.Equals("LightBurn",StringComparison.OrdinalIgnoreCase)
                      ||title.Contains("LightBurn",StringComparison.OrdinalIgnoreCase)))
                    return process.MainWindowHandle;
            }
            catch{}
            finally{process.Dispose();}
        }
        return IntPtr.Zero;
    }
}
