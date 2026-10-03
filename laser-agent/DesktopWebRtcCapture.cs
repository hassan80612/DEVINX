using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace DevinXLaserAgent;

/// <summary>
/// Raw-frame capture for WebRTC. It uses the same virtual-desktop coordinate
/// space as the JPEG fallback so pointer mapping remains identical.
/// </summary>
internal static class DesktopWebRtcCapture
{
    public static WebRtcRawFrame? TryCapture(int maxWidth=1280)
    {
        if(!OperatingSystem.IsWindows())return null;

        var bounds=System.Windows.Forms.SystemInformation.VirtualScreen;
        var width=bounds.Width;
        var height=bounds.Height;
        if(width<200||height<150||width>20000||height>12000)return null;

        using var source=new Bitmap(width,height,PixelFormat.Format24bppRgb);
        try
        {
            using(var graphics=Graphics.FromImage(source))
            {
                graphics.CopyFromScreen(
                    bounds.Left,bounds.Top,0,0,bounds.Size,
                    CopyPixelOperation.SourceCopy);
            }

            var targetWidth=Math.Min(Math.Max(320,maxWidth),width);
            targetWidth=Math.Max(16,(targetWidth/16)*16);
            var scale=(double)targetWidth/width;
            var targetHeight=Math.Max(16,(int)Math.Round(height*scale));
            targetHeight=Math.Max(16,(targetHeight/16)*16);

            Bitmap? resized=null;
            var output=source;
            if(targetWidth!=width||targetHeight!=height)
            {
                resized=new Bitmap(
                    targetWidth,targetHeight,PixelFormat.Format24bppRgb);
                using var g=Graphics.FromImage(resized);
                g.InterpolationMode=InterpolationMode.Bilinear;
                g.PixelOffsetMode=PixelOffsetMode.HighQuality;
                g.DrawImage(source,0,0,targetWidth,targetHeight);
                output=resized;
            }

            try
            {
                var bytes=CopyBgr(output);
                var capturedAt=DateTimeOffset.UtcNow;
                DesktopCapture.RememberCapturedBounds(
                    bounds.Left,bounds.Top,width,height,capturedAt);
                return new WebRtcRawFrame(
                    bytes,output.Width,output.Height,capturedAt);
            }
            finally{resized?.Dispose();}
        }
        catch{return null;}
    }

    private static byte[] CopyBgr(Bitmap bitmap)
    {
        var rect=new Rectangle(0,0,bitmap.Width,bitmap.Height);
        var data=bitmap.LockBits(
            rect,ImageLockMode.ReadOnly,PixelFormat.Format24bppRgb);
        try
        {
            var rowBytes=bitmap.Width*3;
            var result=new byte[rowBytes*bitmap.Height];
            var stride=data.Stride;
            for(var y=0;y<bitmap.Height;y++)
            {
                var sourceY=stride>=0?y:bitmap.Height-1-y;
                var row=IntPtr.Add(data.Scan0,sourceY*stride);
                Marshal.Copy(row,result,y*rowBytes,rowBytes);
            }
            return result;
        }
        finally{bitmap.UnlockBits(data);}
    }
}
