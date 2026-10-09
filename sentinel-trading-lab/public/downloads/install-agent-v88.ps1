param([string]$LocalPayload='')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$site = 'https://sentinel-trading-lab.vercel.app'
$root = Join-Path $env:LOCALAPPDATA 'SentinelTradingLab'
$runtime = Join-Path $root '.sentinel-runtime'
$stage = Join-Path $env:TEMP ('sentinel-v88-' + [Guid]::NewGuid().ToString('N'))
$payloadZip = Join-Path $stage 'payload.zip'
$payloadTmp = Join-Path $stage 'payload'
$installMutex = New-Object System.Threading.Mutex($false, 'Local\SentinelTradingLabInstall')
$locked = $false

function Step($t) { Write-Host "`n$t" -ForegroundColor Cyan }
function Fail($m) { Write-Host "`nERRO: $m" -ForegroundColor Red; if ($env:SENTINEL_INSTALL_TEST -ne '1' -and $env:CI -ne 'true') { Read-Host 'Pressione ENTER para fechar' | Out-Null }; exit 1 }

try {
  try { $locked = $installMutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $locked = $true }
  if (-not $locked) { throw 'Outra instalacao do Sentinel esta em andamento. Aguarde ela terminar.' }
  New-Item -ItemType Directory -Force -Path $stage | Out-Null
  if ($LocalPayload -and (Test-Path $LocalPayload)) { Copy-Item $LocalPayload $payloadZip -Force }
  else { Invoke-WebRequest -UseBasicParsing "$site/downloads/agent_payload_v88.zip?v=13.4.41-market-isolation-1009" -OutFile $payloadZip }
  Expand-Archive -LiteralPath $payloadZip -DestinationPath $payloadTmp -Force
  $manifest = Get-Content (Join-Path $payloadTmp 'package.json') -Raw | ConvertFrom-Json
  $agentRelease = Get-Content (Join-Path $payloadTmp 'release.json') -Raw | ConvertFrom-Json
  if ($manifest.version -ne $agentRelease.version -or $agentRelease.version -ne '13.4.41' -or $agentRelease.build -ne '13.4.41-market-isolation-1009') { throw 'Pacote do Agent nao corresponde a esta instalacao 13.4.41.' }
  try { Invoke-RestMethod 'http://127.0.0.1:8788/exit' -Method Post -TimeoutSec 3 | Out-Null } catch {}
  # Substituicao forçada de qualquer Agent Sentinel antigo antes da instalação.
  Write-Host 'Removendo processos da versão anterior...' -ForegroundColor Cyan
  try {
    Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'SentinelTradingLab' -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'SentinelTradingLabWatchdog' -ErrorAction SilentlyContinue
  } catch {}
  try {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
      $_.CommandLine -and $_.CommandLine -like '*SentinelTradingLab*' -and
      ($_.Name -eq 'node.exe' -or $_.Name -like 'powershell*.exe')
    } | ForEach-Object {
      if ($_.ProcessId -ne $PID) { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }
    }
  } catch {}
  try {
    Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -like 'Sentinel*' } | ForEach-Object { $_ | Stop-ScheduledTask -ErrorAction SilentlyContinue; $_ | Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue }
  } catch {}
  Start-Sleep -Milliseconds 900

  # Nenhum listener antigo pode sobreviver e ser confundido com o novo Worker.
  foreach ($port in @(8787,8788)) {
    foreach ($connection in @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) {
      $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)"
      if ($owner.Name -eq 'node.exe' -and $owner.CommandLine -and ($owner.CommandLine -like '*SentinelTradingLab*' -or $owner.ExecutablePath -like "$root\*")) {
        Stop-Process -Id $owner.ProcessId -Force -ErrorAction Stop
      } else { throw "Porta $port ocupada por outro programa (PID $($connection.OwningProcess))." }
    }
  }
  Write-Host '========================================' -ForegroundColor DarkCyan
  Write-Host '       SENTINEL WINDOWS AGENT V13.4.41' -ForegroundColor White
  Write-Host '       Agent + Worker background + icone na bandeja' -ForegroundColor Gray
  Write-Host '========================================' -ForegroundColor DarkCyan

  Step '1/5 Atualizando arquivos do Agent...'
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  # Limpa codigo antigo sem apagar identidade, sessoes da corretora ou runtime Node.
  $dataDir = Join-Path $root 'worker\data'
  $workerDir = Join-Path $root 'worker'
  if (Test-Path $workerDir) {
    Get-ChildItem -LiteralPath $workerDir -Force | Where-Object { $_.Name -ne 'data' } | Remove-Item -Recurse -Force
  }
  foreach ($item in @('src','node_modules','package.json','package-lock.json')) {
    $target = Join-Path $root $item
    if (Test-Path $target) { Remove-Item $target -Recurse -Force }
  }
  # O pacote nunca substitui os dados locais do usuario.
  Remove-Item (Join-Path $payloadTmp 'worker\data') -Recurse -Force -ErrorAction SilentlyContinue
  Copy-Item (Join-Path $payloadTmp '*') $root -Recurse -Force
  # Estado transitório nunca deve sobreviver a uma reinstalação.
  foreach ($transient in @('agent.exit','manager.pid','worker.pid','tray-health.json','tray-health.json.tmp')) {
    Remove-Item -LiteralPath (Join-Path $dataDir $transient) -Force -ErrorAction SilentlyContinue
  }

  $node = Join-Path $runtime 'node.exe'
  $npm = Join-Path $runtime 'npm.cmd'
  $runtimeReady = (Test-Path $node) -and (Test-Path $npm) -and (Test-Path (Join-Path $runtime 'node_modules\npm\bin\npm-cli.js'))
  if ($runtimeReady) { try { & $node --version | Out-Null; $runtimeReady = $LASTEXITCODE -eq 0 } catch { $runtimeReady = $false } }
  if (-not $runtimeReady) {
    Step '2/5 Baixando Node LTS local (somente na primeira vez)...'
    $releases = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
    $release = $releases | Where-Object { $_.lts -and ($_.files -contains 'win-x64-zip') } | Select-Object -First 1
    if (-not $release) { throw 'Nao foi encontrada uma versao Node LTS para Windows x64.' }
    $nodeZip = Join-Path $stage 'sentinel-node.zip'
    $nodeTmp = Join-Path $stage 'sentinel-node'
    Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$($release.version)/node-$($release.version)-win-x64.zip" -OutFile $nodeZip
    if (Test-Path $nodeTmp) { Remove-Item $nodeTmp -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $nodeTmp | Out-Null
    Expand-Archive -LiteralPath $nodeZip -DestinationPath $nodeTmp -Force
    $nodeFolder = Get-ChildItem $nodeTmp -Directory | Select-Object -First 1
    if (-not $nodeFolder -or -not (Test-Path (Join-Path $nodeFolder.FullName 'node.exe')) -or -not (Test-Path (Join-Path $nodeFolder.FullName 'npm.cmd'))) { throw 'Download do Node incompleto. Execute novamente o instalador.' }
    & (Join-Path $nodeFolder.FullName 'node.exe') --version | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Runtime Node baixado nao iniciou neste Windows.' }
    if (Test-Path $runtime) { Remove-Item $runtime -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $runtime | Out-Null
    Copy-Item (Join-Path $nodeFolder.FullName '*') $runtime -Recurse -Force
  } else { Step '2/5 Node local pronto.' }

  Step '3/5 Encerrando versoes antigas do Agent...'
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    ($_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine -like '*SentinelTradingLab*' -and ($_.CommandLine -like '*worker*index.mjs*' -or $_.CommandLine -like '*agent-manager.mjs*')) -or
    ($_.Name -like 'powershell*.exe' -and $_.CommandLine -and $_.CommandLine -like '*SentinelTradingLab*tray-host.ps1*')
  } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }
  Start-Sleep -Milliseconds 700

  Step '4/5 Instalando dependencias do Agent...'
  $env:Path = "$runtime;$env:Path"
  Push-Location $root
  & $npm install --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "npm install falhou ($LASTEXITCODE)" }
  Pop-Location

  Step '5/5 Iniciando Agent...'
  $tray = Join-Path $root 'worker\tray-host.ps1'
  $watchdog = Join-Path $root 'worker\watchdog.ps1'
  $manager = Join-Path $root 'worker\agent-manager.mjs'

  if ($env:SENTINEL_INSTALL_TEST -eq '1') {
    $env:SENTINEL_WORKER_HOST='127.0.0.1'
    $env:SENTINEL_WORKER_PORT='8787'
    $env:SENTINEL_MANAGER_PORT='8788'
    Start-Process -FilePath $node -ArgumentList @("`"$manager`"") -WorkingDirectory $root -WindowStyle Hidden | Out-Null
  } else {
    $watchdogHost = Join-Path $root 'worker\watchdog-host.ps1'
    $runCmd = "powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$tray`""
    $watchdogCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watchdogHost`""
    New-Item -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'SentinelTradingLab' -Value $runCmd -Force
    Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'SentinelTradingLabWatchdog' -Value $watchdogCmd -Force

    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',"`"$watchdogHost`"") -WindowStyle Hidden | Out-Null
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-STA','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',"`"$tray`"") -WindowStyle Hidden | Out-Null
  }

  $ready = $false
  for ($i=0; $i -lt 120; $i++) {
    try {
      $h = Invoke-RestMethod -UseBasicParsing 'http://127.0.0.1:8788/health' -TimeoutSec 1
      if ($h.ok -and $h.workerHealthy -and $h.version -eq '13.4.41' -and $h.build -eq '13.4.41-market-isolation-1009') { $ready = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw 'Agent abriu, mas o Worker nao respondeu. Consulte install.log e worker\data\manager.log; execute novamente o Agent V13.4.41.' }

  if ($env:SENTINEL_INSTALL_TEST -ne '1') {
    $trayReady = $false
    for ($i=0; $i -lt 30; $i++) {
      try {
        $th = Get-Content (Join-Path $dataDir 'tray-health.json') -Raw | ConvertFrom-Json
        $trayReady = $th.iconVisible -and $th.version -eq $agentRelease.version -and $th.build -eq $agentRelease.build -and ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - [int64]$th.updatedAt) -lt 10000 -and (Get-Process -Id $th.pid -ErrorAction Stop)
        if ($trayReady) { break }
      } catch {}
      Start-Sleep -Milliseconds 500
    }
    if (-not $trayReady) { throw 'Agent ativo, mas a bandeja nao iniciou. Consulte worker\data\tray.log.' }
  }
  Write-Host "`nAgent V13.4.41 pronto." -ForegroundColor Green
  if ($env:SENTINEL_INSTALL_TEST -ne '1') {
    Write-Host 'O icone S fica na bandeja ao lado do relogio.' -ForegroundColor Green
    Write-Host 'Botao direito no icone: Abrir Sentinel, Ligar, Desligar, Reiniciar ou Desinstalar completamente.' -ForegroundColor Cyan
    Write-Host 'Se o Windows esconder o icone, clique na setinha ^ ao lado do relogio.' -ForegroundColor Yellow
    Start-Sleep -Seconds 2
  }
  exit 0
} catch { Fail $_.Exception.Message } finally {
  if ($locked) { try { $installMutex.ReleaseMutex() } catch {} }
  $installMutex.Dispose()
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}

