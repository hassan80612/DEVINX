# Sentinel self-update. Runs only on a paid, paired and IDLE Agent.
# Updates are downloaded from the official site, SHA256 verified, and
# installed using the existing installer. Identity and worker/data survive.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$site='https://sentinel-trading-lab.vercel.app'
$root=Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$log=Join-Path $root 'worker\data\auto-update.log'
function Log([string]$message){
  try{
    Add-Content -LiteralPath $log -Value ("{0:o} {1}" -f (Get-Date),$message)
    if ((Get-Item $log -ErrorAction SilentlyContinue).Length -gt 262144){
      Get-Content $log -Tail 80 | Set-Content $log
    }
  }catch{}
}
$created=$false
$mutex=New-Object System.Threading.Mutex($true,'Local\SentinelTradingLabAutoUpdateV1',[ref]$created)
if(-not $created){exit 0}
try{
  if($env:CI -eq 'true' -or $env:SENTINEL_INSTALL_TEST -eq '1'){exit 0}
  $installed=Get-Content (Join-Path $root 'release.json') -Raw | ConvertFrom-Json
  $remote=Invoke-RestMethod -UseBasicParsing 'http://127.0.0.1:8787/remote-info' -TimeoutSec 3
  if($remote.paired -ne $true -or $remote.accessActive -ne $true){exit 0}
  # Do not interrupt an ongoing scenario or an active trading session.
  $current=Invoke-RestMethod -UseBasicParsing 'http://127.0.0.1:8787/status' -TimeoutSec 4
  if(-not $current.ok -or $current.data.state -in @('running','starting','analyzing')){exit 0}
  $manifest=Invoke-RestMethod -UseBasicParsing "$site/downloads/agent-update.json" -TimeoutSec 8
  if($manifest.format -ne 'sentinel-agent-update-v1'){exit 0}
  $newVersion=[Version]([string]$manifest.version)
  $oldVersion=[Version]([string]$installed.version)
  if($newVersion -le $oldVersion){exit 0}
  $sha=([string]$manifest.zipSha256).ToLower()
  if($sha -notmatch '^[a-f0-9]{64}$' -or -not $manifest.build){throw 'release_manifest_invalid'}
  $identityPath=Join-Path $env:LOCALAPPDATA 'SentinelTradingLabIdentity\remote-device.json'
  $identity=Get-Content $identityPath -Raw | ConvertFrom-Json
  if($identity.format -ne 'sentinel-device-v2' -or $identity.deviceToken.format -ne 'dpapi-local-machine-v1'){throw 'invalid_stored_identity'}
  Add-Type -AssemblyName System.Security
  $cipher=[Convert]::FromBase64String([string]$identity.deviceToken.value)
  $secret=[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($cipher,$null,[Security.Cryptography.DataProtectionScope]::LocalMachine))
  if(-not $identity.installId -or $secret.Length -lt 24){throw 'identity_unavailable'}
  $proof=@{installId=[string]$identity.installId;deviceSecret=$secret}|ConvertTo-Json -Compress
  $header=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($proof))
  $stage=Join-Path $env:TEMP ('sentinel-update-'+[guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $stage -Force|Out-Null
  $zip=Join-Path $stage 'agent-update.zip'
  $headers=@{'X-Sentinel-Agent-Install'=$header}
  Invoke-WebRequest -UseBasicParsing -Uri "$site/downloads/agent_payload_v88.zip?v=$([Uri]::EscapeDataString([string]$manifest.build))" -Headers $headers -OutFile $zip -TimeoutSec 90
  $received=(Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
  if($received -ne $sha){Remove-Item $zip -Force -ErrorAction SilentlyContinue;throw 'update_sha256_mismatch'}
  $installer=Join-Path $root 'worker\install-agent-update.ps1'
  if(-not(Test-Path $installer)){throw 'installer_script_missing'}
  # Launch an independent installer: it closes Agent processes before replacing
  # code, verifies manifest against expected version/build, and preserves data.
  $arg="-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$installer`" -LocalPayload `"$zip`" -ExpectedVersion `"$($manifest.version)`" -ExpectedBuild `"$($manifest.build)`""
  Start-Process -FilePath 'powershell.exe' -ArgumentList $arg -WindowStyle Hidden | Out-Null
  Log ("auto_update_started "+$manifest.version)
}catch{
  Log ("auto_update_failed "+$_.Exception.Message)
}finally{
  try{$mutex.ReleaseMutex()}catch{}
  $mutex.Dispose()
}
