param([string]$Root=(Join-Path $env:LOCALAPPDATA 'SentinelTradingLab'))
$ErrorActionPreference='Stop'
$release=Get-Content (Join-Path $Root 'release.json') -Raw | ConvertFrom-Json
$heartbeat=Join-Path $Root 'worker/data/tray-health.json'
function Wait-Tray([int]$Previous=0){
  for($i=0;$i -lt 100;$i++){
    try{
      $th=Get-Content $heartbeat -Raw | ConvertFrom-Json
      $p=Get-Process -Id $th.pid -ErrorAction Stop
      if($th.iconVisible -and $th.version -eq $release.version -and $th.build -eq $release.build -and $p.Id -ne $Previous -and ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-[int64]$th.updatedAt) -lt 8000){return $th}
    }catch{}
    Start-Sleep -Milliseconds 500
  }
  throw 'Tray failed to initialize/recover with a fresh heartbeat'
}
$before=Invoke-RestMethod 'http://127.0.0.1:8788/health'
$tray=Start-Process powershell.exe -ArgumentList @('-NoProfile','-STA','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',"`"$(Join-Path $Root 'worker/tray-host.ps1')`"") -PassThru
$hostProcess=$null
try{
  $th=Wait-Tray
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'worker/watchdog.ps1')
  if($LASTEXITCODE -ne 0){throw 'Watchdog failed'}
  Start-Sleep -Seconds 6
  $h=Invoke-RestMethod 'http://127.0.0.1:8788/health'
  if(-not $h.workerHealthy -or $h.managerPid -ne $before.managerPid -or $h.workerPid -ne $before.workerPid){throw 'Tray/watchdog restarted a healthy release'}
  $hostProcess=Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',"`"$(Join-Path $Root 'worker/watchdog-host.ps1')`"") -PassThru
  Stop-Process -Id $th.pid -Force
  $restored=Wait-Tray -Previous $th.pid
  $h=Invoke-RestMethod 'http://127.0.0.1:8788/health'
  if($h.managerPid -ne $before.managerPid -or $h.workerPid -ne $before.workerPid){throw 'Recovering the tray restarted the Agent'}
  Invoke-RestMethod 'http://127.0.0.1:8788/exit' -Method Post | Out-Null
  Start-Sleep -Seconds 8
  try{$h=Invoke-RestMethod 'http://127.0.0.1:8788/health' -TimeoutSec 1}catch{$h=$null}
  if($h){throw 'Tray/watchdog ignored the explicit stop'}
  if(-not (Test-Path (Join-Path $Root 'worker/data/agent.exit'))){throw 'Tray removed the explicit stop marker'}
  Write-Host 'TRAY STARTUP + MATCHING RELEASE + RECOVERY + EXPLICIT STOP: PASS'
}finally{
  if($hostProcess){Stop-Process -Id $hostProcess.Id -Force -ErrorAction SilentlyContinue}
  try{$th=Get-Content $heartbeat -Raw | ConvertFrom-Json;Stop-Process -Id $th.pid -Force -ErrorAction SilentlyContinue}catch{}
  Stop-Process -Id $tray.Id -Force -ErrorAction SilentlyContinue
  Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'SentinelTradingLab' -ErrorAction SilentlyContinue
  Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'SentinelTradingLabWatchdog' -ErrorAction SilentlyContinue
}
