$ErrorActionPreference='SilentlyContinue'
$root=Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$node=if($env:SENTINEL_NODE_PATH){$env:SENTINEL_NODE_PATH}else{Join-Path $root '.sentinel-runtime\node.exe'}
$manager=Join-Path $root 'worker\agent-manager.mjs'
$exitMarker=Join-Path $root 'worker\data\agent.exit'
$logDir=Join-Path $root 'worker\data';$logFile=Join-Path $logDir 'watchdog.log'
function Log([string]$m){try{New-Item -ItemType Directory -Force -Path $logDir|Out-Null;Add-Content -LiteralPath $logFile -Value ("{0:o} {1}" -f (Get-Date),$m)}catch{}}
if(Test-Path $exitMarker){exit 0}
if(-not(Test-Path $node)-or-not(Test-Path $manager)){Log 'arquivos_do_agent_ausentes';exit 0}
$managerOk=$false
try{$h=Invoke-RestMethod -UseBasicParsing 'http://127.0.0.1:8788/health' -TimeoutSec 2;$managerOk=($h.ok -eq $true);if($managerOk -and $h.workerHealthy -ne $true){try{Invoke-RestMethod -UseBasicParsing 'http://127.0.0.1:8788/start' -Method Post -TimeoutSec 12|Out-Null;Log 'worker_start_solicitado'}catch{Log 'worker_start_pendente'}}}catch{}
if($managerOk){exit 0}
$p=Get-CimInstance Win32_Process -ErrorAction SilentlyContinue|Where-Object{$_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine -like '*SentinelTradingLab*agent-manager.mjs*'}|Select-Object -First 1
if($p){Log 'manager_presente_inicializando';exit 0}
$env:SENTINEL_WORKER_HOST='127.0.0.1';$env:SENTINEL_WORKER_PORT='8787';$env:SENTINEL_MANAGER_PORT='8788'
$env:SENTINEL_ALLOWED_ORIGINS='https://sentinel-trading-lab.vercel.app,https://sentinel-trading-lab-iguassu-shop.vercel.app'
try{Start-Process -FilePath $node -ArgumentList @($manager) -WorkingDirectory $root -WindowStyle Hidden|Out-Null;Log 'manager_iniciado'}catch{Log ('falha_iniciar_manager '+$_.Exception.Message)}
