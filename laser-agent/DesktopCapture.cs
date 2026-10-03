using System.Drawing;
using System.Drawing.Imaging;

namespace DevinXLaserAgent;

/// <summary>
/// Captures the interactive Windows desktop independently of LightBurn.
/// The coordinate space is the complete virtual desktop, including monitors
/// positioned to the left/top of the primary display.
/// </summary>
internal static class DesktopCapture
{
    private const int MaxJpegBytes=150_000;
    private static readonly object LastCaptureGate=new();
    private static int _lastCapturedLeft;
    private static int _lastCapturedTop;
    private static int _lastCapturedWidth;
    private static int _lastCapturedHeight;
    private static DateTimeOffset _lastCapturedAtUtc=DateTimeOffset.MinValue;

    public static CapturedPreview? TryCapture()
    {
        if(!OperatingSystem.IsWindows())return null;

        var bounds=System.Windows.Forms.SystemInformation.VirtualScreen;
        if(bounds.Width<200||bounds.Height<150||bounds.Width>20000||bounds.Height>12000)
            return null;

        using var source=new Bitmap(bounds.Width,bounds.Height,PixelFormat.Format24bppRgb);
        try
        {
            using var graphics=Graphics.FromImage(source);
            graphics.CopyFromScreen(
                bounds.Left,bounds.Top,0,0,bounds.Size,
                CopyPixelOperation.SourceCopy);
        }
        catch{return null;}

        var encoded=EncodeAdaptive(source);
        if(encoded is null)return null;

        var capturedAt=DateTimeOffset.UtcNow;
        RememberCapturedBounds(
            bounds.Left,bounds.Top,bounds.Width,bounds.Height,capturedAt);

        return new CapturedPreview(
            encoded.Value.Bytes,
            encoded.Value.Width,
            encoded.Value.Height,
            capturedAt);
    }

    internal static void RememberCapturedBounds(
        int left,int top,int width,int height,DateTimeOffset capturedAt)
    {
        if(width<=0||height<=0)return;
        lock(LastCaptureGate)
        {
            _lastCapturedLeft=left;
            _lastCapturedTop=top;
            _lastCapturedWidth=width;
            _lastCapturedHeight=height;
            _lastCapturedAtUtc=capturedAt;
        }
    }

    public static bool TryGetLastCapturedBounds(
        out int left,out int top,out int width,out int height)
    {
        left=top=width=height=0;
        lock(LastCaptureGate)
        {
            if(_lastCapturedWidth<=0||_lastCapturedHeight<=0
               ||DateTimeOffset.UtcNow-_lastCapturedAtUtc>TimeSpan.FromSeconds(2))
                return false;

            left=_lastCapturedLeft;
            top=_lastCapturedTop;
            width=_lastCapturedWidth;
            height=_lastCapturedHeight;
            return true;
        }
    }

    private static (byte[] Bytes,int Width,int Height)? EncodeAdaptive(Bitmap source)
    {
        foreach(var width in new[]{1600,1440,1280,1120,960,840,720})
        {
            Bitmap? resized=null;
            Bitmap output=source;

            if(source.Width>width)
            {
                var scale=(double)width/source.Width;
                var targetHeight=Math.Max(1,(int)Math.Round(source.Height*scale));
                resized=new Bitmap(width,targetHeight,PixelFormat.Format24bppRgb);
                using var g=Graphics.FromImage(resized);
                g.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                g.DrawImage(source,0,0,width,targetHeight);
                output=resized;
            }

            try
            {
                foreach(var quality in new long[]{72,64,56,48,40})
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
        var codec=ImageCodecInfo.GetImageEncoders()
            .First(x=>x.FormatID==ImageFormat.Jpeg.Guid);
        using var parameters=new EncoderParameters(1);
        parameters.Param[0]=new EncoderParameter(
            System.Drawing.Imaging.Encoder.Quality,quality);
        bitmap.Save(stream,codec,parameters);
        return stream.ToArray();
    }
}
