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

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd,out Rect rect);

    [DllImport("user32.dll")]
    private static extern bool PrintWindow(IntPtr hWnd,IntPtr hdcBlt,uint nFlags);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);

    public static CapturedPreview? TryCapture()
    {
        if(!OperatingSystem.IsWindows())return null;

        var handle=FindLightBurnWindow();
        if(handle==IntPtr.Zero||IsIconic(handle))return null;
        if(!GetWindowRect(handle,out var rect))return null;

        var width=rect.Right-rect.Left;
        var height=rect.Bottom-rect.Top;
        if(width<200||height<150||width>10000||height>10000)return null;

        using var source=new Bitmap(width,height,PixelFormat.Format24bppRgb);
        var printed=false;
        using(var graphics=Graphics.FromImage(source))
        {
            var hdc=graphics.GetHdc();
            try{printed=PrintWindow(handle,hdc,2);}finally{graphics.ReleaseHdc(hdc);}
        }

        if(!printed)
        {
            try
            {
                using var graphics=Graphics.FromImage(source);
                graphics.CopyFromScreen(rect.Left,rect.Top,0,0,new Size(width,height),CopyPixelOperation.SourceCopy);
            }
            catch{return null;}
        }

        const int maxWidth=1280;
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
            parameters.Param[0]=new EncoderParameter(System.Drawing.Imaging.Encoder.Quality,60L);
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
