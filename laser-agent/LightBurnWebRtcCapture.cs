using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace DevinXLaserAgent;

internal sealed record WebRtcRawFrame(byte[] Bgr,int Width,int Height,DateTimeOffset CapturedAtUtc);

internal static class LightBurnWebRtcCapture
{
    private const uint PwRenderFullContent=0x00000002;

    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd,out uint processId);
    [DllImport("user32.dll",SetLastError=true)] private static extern bool PrintWindow(IntPtr hWnd,IntPtr hdcBlt,uint nFlags);

    public static WebRtcRawFrame? TryCapture(int maxWidth=1280)
    {
        if(!OperatingSystem.IsWindows())return null;
        var main=LightBurnWindowCapture.FindLightBurnWindow();
        if(main==IntPtr.Zero||!LightBurnWindowCapture.TryGetPhysicalBounds(main,out var left,out var top,out var width,out var height))return null;
        if(width<200||height<150||width>10000||height>10000)return null;

        using var source=new Bitmap(width,height,PixelFormat.Format24bppRgb);
        try
        {
            if(BelongsToSameProcess(main,GetForegroundWindow()))
            {
                using var graphics=Graphics.FromImage(source);
                graphics.CopyFromScreen(left,top,0,0,new Size(width,height),CopyPixelOperation.SourceCopy);
            }
            else
            {
                if(!PrintWindowInto(source,main))return null;
                OverlayActiveDialog(main,source,left,top);
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
                resized=new Bitmap(targetWidth,targetHeight,PixelFormat.Format24bppRgb);
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
                LightBurnWindowCapture.RememberCapturedBounds(main,left,top,width,height,capturedAt);
                return new WebRtcRawFrame(bytes,output.Width,output.Height,capturedAt);
            }
            finally{resized?.Dispose();}
        }
        catch{return null;}
    }

    private static byte[] CopyBgr(Bitmap bitmap)
    {
        var rect=new Rectangle(0,0,bitmap.Width,bitmap.Height);
        var data=bitmap.LockBits(rect,ImageLockMode.ReadOnly,PixelFormat.Format24bppRgb);
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

    private static bool PrintWindowInto(Bitmap target,IntPtr handle)
    {
        using var graphics=Graphics.FromImage(target);
        var hdc=graphics.GetHdc();
        try{return PrintWindow(handle,hdc,PwRenderFullContent);}
        finally{graphics.ReleaseHdc(hdc);}
    }

    private static void OverlayActiveDialog(IntPtr main,Bitmap target,int mainLeft,int mainTop)
    {
        if(!LightBurnWindowCapture.TryGetInteractionBounds(main,out var dialog,out var left,out var top,out var width,out var height)
           ||dialog==main||width<100||height<70)return;
        using var dialogBitmap=new Bitmap(width,height,PixelFormat.Format24bppRgb);
        if(!PrintWindowInto(dialogBitmap,dialog))return;
        using var graphics=Graphics.FromImage(target);
        graphics.DrawImageUnscaled(dialogBitmap,left-mainLeft,top-mainTop);
    }

    private static bool BelongsToSameProcess(IntPtr main,IntPtr candidate)
    {
        if(main==IntPtr.Zero||candidate==IntPtr.Zero)return false;
        GetWindowThreadProcessId(main,out var mainPid);
        GetWindowThreadProcessId(candidate,out var candidatePid);
        return mainPid!=0&&mainPid==candidatePid;
    }
}
