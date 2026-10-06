$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.SoftwareBitmap,Windows.Graphics.Imaging,ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapPixelFormat,Windows.Graphics.Imaging,ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapAlphaMode,Windows.Graphics.Imaging,ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine,Windows.Media.Ocr,ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrResult,Windows.Media.Ocr,ContentType=WindowsRuntime] | Out-Null
$asTask=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Await-Result($operation,$type){
  $task=$asTask.MakeGenericMethod($type).Invoke($null,@($operation))
  if(-not $task.Wait(4000)){throw 'native_ocr_operation_timeout'}
  return $task.Result
}
$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if($null -eq $engine){$languages=[Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages; if($languages.Count -gt 0){$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($languages[0])}}
while($null -ne ($line=[Console]::ReadLine())){
  $request=$null;$stream=$null;$bitmap=$null
  try{
    $request=$line | ConvertFrom-Json
    if($null -eq $engine){throw 'windows_ocr_language_missing'}
    $file=Await-Result ([Windows.Storage.StorageFile]::GetFileFromPathAsync([string]$request.path)) ([Windows.Storage.StorageFile])
    $stream=Await-Result ($file.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
    $decoder=Await-Result ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap=Await-Result ($decoder.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,[Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied)) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result=Await-Result ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    $lines=@();foreach($entry in $result.Lines){
      $words=@($entry.Words);if($words.Count -eq 0){continue}
      $x=($words | ForEach-Object {$_.BoundingRect.X} | Measure-Object -Minimum).Minimum
      $y=($words | ForEach-Object {$_.BoundingRect.Y} | Measure-Object -Minimum).Minimum
      $right=($words | ForEach-Object {$_.BoundingRect.X+$_.BoundingRect.Width} | Measure-Object -Maximum).Maximum
      $bottom=($words | ForEach-Object {$_.BoundingRect.Y+$_.BoundingRect.Height} | Measure-Object -Maximum).Maximum
      $lines+=@{text=[string]$entry.Text;x=$x;y=$y;width=$right-$x;height=$bottom-$y}
    }
    [Console]::WriteLine((@{id=$request.id;width=$bitmap.PixelWidth;height=$bitmap.PixelHeight;lines=$lines} | ConvertTo-Json -Compress -Depth 5))
  }catch{[Console]::WriteLine((@{id=$request.id;error='native_ocr_failed: '+$_.Exception.Message} | ConvertTo-Json -Compress))}
  finally{if($bitmap){$bitmap.Dispose()};if($stream){$stream.Dispose()}}
}
