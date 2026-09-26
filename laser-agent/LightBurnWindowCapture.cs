using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace DevinXLaserAgent;

internal sealed record CapturedPreview(byte[] Jpeg,int Width,int Height,DateTimeOffset CapturedAtUtc);

internal static class LightBurnWindowCapture
{
    [StructLayout(LayoutKind.Sequential)]
    private struct Rect { public int Left,Top,Right,Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    private struct Point { public int X,Y; }

    [DllImport("user32.dll")]
    private static extern bool GetClientRect(IntPtr hWnd,out Rect rect);

    [DllImport("user32.dll")]
    private static extern bool ClientToScreen(IntPtr hWnd,ref Point point);

    [DllImport("user32.dll")]
    private static extern bool PrintWindow(IntPtr hWnd,IntPtr hdcBlt,uint nFlags);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll",SetLastError=true)]
    private static extern bool PostMessage(IntPtr hWnd,uint msg,IntPtr wParam,IntPtr lParam);

    private const uint PwClientOnly=0x00000001;
    private const uint WmMouseMove=0x0200;
    private const uint WmLButtonDown=0x0201;
    private const uint WmLButtonUp=0x0202;
    private static readonly IntPtr MkLButton=(IntPtr)0x0001;

    public static CapturedPreview? TryCapture()
    {
        if(!OperatingSystem.IsWindows())return null;

        var handle=FindLightBurnWindow();
        if(handle==IntPtr.Zero||IsIconic(handle))return null;
        if(!GetClientRect(handle,out var rect))return null;

        var width=rect.Right-rect.Left;
        var height=rect.Bottom-rect.Top;
        if(width<200||height<150||width>10000||height>10000)return null;

        using var source=new Bitmap(width,height,PixelFormat.Format24bppRgb);
        var printed=false;
        using(var graphics=Graphics.FromImage(source))
        {
            var hdc=graphics.GetHdc();
            try{printed=PrintWindow(handle,hdc,PwClientOnly);}finally{graphics.ReleaseHdc(hdc);}
        }

        if(!printed)
        {
            try
            {
                var origin=new Point();
                if(!ClientToScreen(handle,ref origin))return null;
                using var graphics=Graphics.FromImage(source);
                graphics.CopyFromScreen(origin.X,origin.Y,0,0,new Size(width,height),CopyPixelOperation.SourceCopy);
            }
            catch{return null;}
        }

        const int maxWidth=1600;
        Bitmap output=source;
        Bitmap? resized=null;
        if(width>maxWidth)
        {
            var scale=(double)maxWidth/width;
            var targetHeight=Math.Max(1,(int)Math.Round(height*scale));
            resized=new Bitmap(maxWidth,targetHeight,PixelFormat.Format24bppRgb);
            using var g=Graphics.FromImage(resized);
            g.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
            g.DrawImage(source,0,0,maxWidth,targetHeight);
            output=resized;
        }

        try
        {
            using var stream=new MemoryStream();
            var codec=ImageCodecInfo.GetImageEncoders().First(x=>x.FormatID==ImageFormat.Jpeg.Guid);
            using var parameters=new EncoderParameters(1);
            parameters.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,55L);
            output.Save(stream,codec,parameters);
            var bytes=stream.ToArray();
            if(bytes.Length<100||bytes.Length>500000)return null;
            return new CapturedPreview(bytes,output.Width,output.Height,DateTimeOffset.UtcNow);
        }
        finally
        {
            resized?.Dispose();
        }
    }

    public static bool TryTap(double normalizedX,double normalizedY)
    {
        if(!OperatingSystem.IsWindows())return false;
        if(normalizedX<0||normalizedX>1||normalizedY<0||normalizedY>1)return false;

        var handle=FindLightBurnWindow();
        if(handle==IntPtr.Zero||IsIconic(handle))return false;
        if(!GetClientRect(handle,out var rect))return false;

        var width=rect.Right-rect.Left;
        var height=rect.Bottom-rect.Top;
        if(width<1||height<1)return false;

        var x=Math.Clamp((int)Math.Round(normalizedX*(width-1)),0,width-1);
        var y=Math.Clamp((int)Math.Round(normalizedY*(height-1)),0,height-1);
        var lParam=(IntPtr)((y<<16)|(x&0xFFFF));

        PostMessage(handle,WmMouseMove,IntPtr.Zero,lParam);
        if(!PostMessage(handle,WmLButtonDown,MkLButton,lParam))return false;
        Thread.Sleep(28);
        return PostMessage(handle,WmLButtonUp,IntPtr.Zero,lParam);
    }

    private static IntPtr FindLightBurnWindow()
    {
        foreach(var process in Process.GetProcesses())
        {
            try
            {
                var name=process.ProcessName;
                var title=process.MainWindowTitle;
                if(process.MainWindowHandle!=IntPtr.Zero
                   && (name.Equals("LightBurn",StringComparison.OrdinalIgnoreCase)
                       || title.Contains("LightBurn",StringComparison.OrdinalIgnoreCase)))
                    return process.MainWindowHandle;
            }
            catch { }
            finally { process.Dispose(); }
        }
        return IntPtr.Zero;
    }
}
