$ErrorActionPreference='SilentlyContinue'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$node = if ($env:SENTINEL_NODE_PATH) { $env:SENTINEL_NODE_PATH } else { Join-Path $root '.sentinel-runtime\node.exe' }
$manager = Join-Path $root 'worker\agent-manager.mjs'
$exitMarker = Join-Path $root 'worker\data\agent.exit'
$health = 'http://127.0.0.1:8788/health'
$logDir = Join-Path $root 'worker\data'
$logFile = Join-Path $logDir 'watchdog.log'

function Log([string]$m) {
  try {
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    Add-Content -LiteralPath $logFile -Value ("{0:o} {1}" -f (Get-Date),$m)
    if ((Get-Item $logFile -ErrorAction SilentlyContinue).Length -gt 1048576) {
      Get-Content $logFile -Tail 300 | Set-Content $logFile
    }
  } catch {}
}

if (Test-Path $exitMarker) { exit 0 }
if (-not (Test-Path $node) -or -not (Test-Path $manager)) { Log 'arquivos_do_agent_ausentes'; exit 0 }

$ok=$false
$reason='health_fail'
try {
  $h=Invoke-RestMethod -UseBasicParsing $health -TimeoutSec 2
  $ok=($h.ok -eq $true -and $h.workerHealthy -eq $true)
  if ($ok) {
    try {
      $ri=Invoke-RestMethod -UseBasicParsing 'http://127.0.0.1:8787/remote-info' -TimeoutSec 2
      if ($ri.paired -eq $true -and $ri.lastContactAt) {
        $age=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-[int64]$ri.lastContactAt
        if ($age -gt 75000) { $ok=$false; $reason=('remote_stale_'+$age+'ms') }
      }
    } catch {
      $ok=$false; $reason='remote_info_unreachable'
    }
  }
} catch {}

if ($ok) { exit 0 }

Log ($reason+' reiniciando_manager')

try {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine -like '*SentinelTradingLab*agent-manager.mjs*'
  } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {}

Start-Sleep -Milliseconds 350
$env:SENTINEL_WORKER_HOST='127.0.0.1'
$env:SENTINEL_WORKER_PORT='8787'
$env:SENTINEL_MANAGER_PORT='8788'
$env:SENTINEL_ALLOWED_ORIGINS='https://sentinel-trading-lab.vercel.app,https://sentinel-trading-lab-iguassu-shop.vercel.app'
try {
  Start-Process -FilePath $node -ArgumentList @($manager) -WorkingDirectory $root -WindowStyle Hidden | Out-Null
  Log 'manager_iniciado'
} catch {
  Log ('falha_iniciar_manager '+$_.Exception.Message)
}
