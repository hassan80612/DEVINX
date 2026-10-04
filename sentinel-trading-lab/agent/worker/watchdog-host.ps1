$ErrorActionPreference='SilentlyContinue'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$watchdog = Join-Path $root 'worker\watchdog.ps1'
$exitMarker = Join-Path $root 'worker\data\agent.exit'

$created = $false
$mutex = New-Object System.Threading.Mutex($true,'Local\SentinelTradingLabWatchdogV880',[ref]$created)
if (-not $created) { exit 0 }

try {
  while ($true) {
    if (Test-Path $exitMarker) {
      Start-Sleep -Seconds 5
      continue
    }
    try {
      & powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $watchdog | Out-Null
    } catch {}
    Start-Sleep -Seconds 20
  }
} finally {
  try { $mutex.ReleaseMutex() } catch {}
  $mutex.Dispose()
}
