$ErrorActionPreference='SilentlyContinue'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$tray = Join-Path $root 'worker\tray-host.ps1'
$trayHealth = Join-Path $root 'worker\data\tray-health.json'
$lastTrayStart = [DateTimeOffset]::MinValue
$watchdog = Join-Path $root 'worker\watchdog.ps1'
$exitMarker = Join-Path $root 'worker\data\agent.exit'
$autoUpdater = Join-Path $root 'worker\auto-update.ps1'
$lastAutoUpdateCheck = [DateTimeOffset]::MinValue

$created = $false
$mutex = New-Object System.Threading.Mutex($true,'Local\SentinelTradingLabWatchdogV880',[ref]$created)
if (-not $created) { exit 0 }

try {
  while ($true) {
    # Recupera também o controlador da bandeja na sessão do usuário.
    $trayAlive = $false
    try {
      $th = Get-Content $trayHealth -Raw | ConvertFrom-Json
      $trayProcess = Get-Process -Id $th.pid -ErrorAction Stop
      $trayAlive = $trayProcess.SessionId -eq (Get-Process -Id $PID).SessionId -and ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - [int64]$th.updatedAt) -lt 20000 -and $th.iconVisible
    } catch {}
    if (-not $trayAlive -and ([DateTimeOffset]::UtcNow - $lastTrayStart).TotalSeconds -ge 20) {
      Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-STA','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',"`"$tray`"") -WindowStyle Hidden | Out-Null
      $lastTrayStart = [DateTimeOffset]::UtcNow
    }
    if (Test-Path $exitMarker) {
      Start-Sleep -Seconds 5
      continue
    }
    try {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $watchdog | Out-Null
    } catch {}
    # One lightweight release check every 75 min. Never interrupt an active
    # analysis: updater validates remote license + stopped runtime first.
    if (([DateTimeOffset]::UtcNow - $lastAutoUpdateCheck).TotalMinutes -ge 75 -and (Test-Path $autoUpdater)) {
      $lastAutoUpdateCheck = [DateTimeOffset]::UtcNow
      try {
        Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',"`"$autoUpdater`"") -WindowStyle Hidden | Out-Null
      } catch {}
    }
    Start-Sleep -Seconds 20
  }
} finally {
  try { $mutex.ReleaseMutex() } catch {}
  $mutex.Dispose()
}

