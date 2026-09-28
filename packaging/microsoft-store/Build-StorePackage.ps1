[CmdletBinding()]
param(
    [ValidateSet('Agent', 'Mentoria')][string]$Mode = 'Mentoria',
    [string]$IdentityName,
    [string]$Publisher,
    [string]$PublisherDisplayName,
    [ValidatePattern('^\d+\.\d+\.\d+\.0$')][string]$Version = '1.0.28.0',
    [switch]$ValidationOnly
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$out = Join-Path $root "artifacts/store/$Mode"
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
$stage = New-Item -ItemType Directory -Path "$out/stage" -Force

if ($ValidationOnly) {
    $IdentityName = "DevinX.Validation.$Mode"
    $Publisher = 'CN=DevinX-Validation-Only'
    $PublisherDisplayName = 'DevinX Validation'
} elseif (!$IdentityName -or !$Publisher -or !$PublisherDisplayName) {
    throw 'Supply IdentityName, Publisher and PublisherDisplayName exactly as shown in Partner Center > Product identity. No submission can be made with a validation identity.'
}
if ($IdentityName -notmatch '^[A-Za-z0-9][A-Za-z0-9.-]{2,49}$') { throw 'Invalid package identity name.' }
if (!$Publisher.StartsWith('CN=')) { throw 'Publisher must be the distinguished name assigned by Partner Center.' }
$parsedVersion = [version]$Version
if ($parsedVersion.Major -lt 1 -or $parsedVersion.Major -gt 65535 -or $parsedVersion.Minor -gt 65535 -or $parsedVersion.Build -gt 65535) { throw 'Invalid Store version.' }

$exe = if ($Mode -eq 'Mentoria') { 'DevinX-Mentoria' } else { 'DevinXLaserAgent' }
$title = if ($Mode -eq 'Mentoria') { 'DevinX Mentoria' } else { 'DevinX Laser Agent' }
& dotnet publish "$root/laser-agent/DevinXLaserAgent.csproj" -c Release -r win-x64 --self-contained true `
    -p:StoreDistribution=true -p:AssemblyName=$exe -p:Version=$Version `
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:DebugType=None -p:DebugSymbols=false -o $stage.FullName
if ($LASTEXITCODE -ne 0) { throw 'Agent compilation failed.' }

# Generate simple, original brand assets; no external image downloads.
Add-Type -AssemblyName System.Drawing
$assets = New-Item -ItemType Directory -Path "$stage/Assets" -Force
foreach ($size in @(50, 44, 150)) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(212, 175, 55), [single]($size * 0.10))
    try {
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.Clear([System.Drawing.Color]::FromArgb(24, 24, 27))
        $graphics.DrawLine($pen, [single]($size * 0.28), [single]($size * 0.25), [single]($size * 0.72), [single]($size * 0.75))
        $graphics.DrawLine($pen, [single]($size * 0.72), [single]($size * 0.25), [single]($size * 0.28), [single]($size * 0.75))
        $bitmap.Save((Join-Path $assets.FullName "Logo$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $pen.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
}
$startup = ''
if ($Mode -eq 'Agent') {
    $startup = @"
      <Extensions>
        <desktop:Extension Category="windows.startupTask" Executable="$exe.exe" EntryPoint="Windows.FullTrustApplication" uap10:Parameters="--background">
          <desktop:StartupTask TaskId="DevinXLaserStartup" Enabled="true" DisplayName="DevinX Laser Agent" />
        </desktop:Extension>
      </Extensions>
"@
}
$nameXml = [System.Security.SecurityElement]::Escape($IdentityName)
$publisherXml = [System.Security.SecurityElement]::Escape($Publisher)
$displayXml = [System.Security.SecurityElement]::Escape($PublisherDisplayName)
$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
 xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
 xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
 xmlns:desktop="http://schemas.microsoft.com/appx/manifest/desktop/windows10"
 xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
 IgnorableNamespaces="uap uap10 desktop rescap">
  <Identity Name="$nameXml" Publisher="$publisherXml" Version="$Version" ProcessorArchitecture="x64" />
  <Properties><DisplayName>$title</DisplayName><PublisherDisplayName>$displayXml</PublisherDisplayName><Logo>Assets\Logo50.png</Logo></Properties>
  <Resources><Resource Language="pt-BR" /></Resources>
  <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0" /></Dependencies>
  <Applications>
    <Application Id="DevinX" Executable="$exe.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="$title" Description="Conecte o LightBurn ao DevinX Laser Control" BackgroundColor="#18181B" Square150x150Logo="Assets\Logo150.png" Square44x44Logo="Assets\Logo44.png" />
$startup
    </Application>
  </Applications>
  <Capabilities><rescap:Capability Name="runFullTrust" /></Capabilities>
</Package>
"@
$manifest | Set-Content "$stage/AppxManifest.xml" -Encoding utf8
$makeappx = Get-ChildItem "${env:ProgramFiles(x86)}/Windows Kits/10/bin/*/x64/makeappx.exe" |
    Sort-Object { [version]$_.Directory.Parent.Name } -Descending | Select-Object -First 1
if (!$makeappx) { throw 'Windows SDK MakeAppx.exe is required.' }
$suffix = if ($ValidationOnly) { '-VALIDATION-NOT-FOR-DISTRIBUTION' } else { '' }
$package = "$out/DevinX-$Mode-$Version-x64$suffix.msix"
# Keep MakeAppx semantic validation enabled. Store signs the submitted package.
& $makeappx.FullName pack /d $stage.FullName /p $package /o
if ($LASTEXITCODE -ne 0) { throw 'MSIX validation or packaging failed.' }
& $makeappx.FullName unpack /p $package /d "$out/verified" /o
if ($LASTEXITCODE -ne 0) { throw 'MSIX extraction validation failed.' }
if ((Get-FileHash "$stage/$exe.exe").Hash -ne (Get-FileHash "$out/verified/$exe.exe").Hash) { throw 'Packaged executable mismatch.' }
[xml]$verified = Get-Content "$out/verified/AppxManifest.xml" -Raw
if ($verified.Package.Identity.Name -ne $IdentityName) { throw 'Package identity mismatch.' }
$startupCount = $verified.SelectNodes("//*[local-name()='StartupTask']").Count
if (($Mode -eq 'Mentoria' -and $startupCount -ne 0) -or ($Mode -eq 'Agent' -and $startupCount -ne 1)) { throw 'Startup policy mismatch.' }
Get-FileHash $package -Algorithm SHA256 | ForEach-Object { "$($_.Hash)  $([IO.Path]::GetFileName($_.Path))" } | Set-Content "$package.sha256"
@{
    mode = $Mode; version = $Version; identity = $IdentityName; publisher = $Publisher;
    validationOnly = [bool]$ValidationOnly; signature = 'Unsigned: Microsoft Store signs after certification';
    buildCommit = (git -C $root rev-parse HEAD); generatedUtc = [DateTime]::UtcNow.ToString('O')
} | ConvertTo-Json | Set-Content "$out/build-info.json"
Write-Host "Validated package: $package"
