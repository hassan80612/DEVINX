param(
  [string]$LocalPayload='',
  [string]$ExpectedVersion='',
  [string]$ExpectedBuild='',
  [switch]$VerifyPayloadOnly
)
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
# Keep the install diagnostics WITHOUT creating inherited OS pipes from Go.
# A long-running Worker/tray must never keep the installer window alive.
$installTranscriptActive = $false
try {
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  Start-Transcript -Path (Join-Path $root 'install.log') -Append -ErrorAction Stop | Out-Null
  $installTranscriptActive = $true
} catch {
  Write-Host 'Aviso: nao foi possivel ativar o log completo desta instalacao.' -ForegroundColor Yellow
}

function Step($t) { Write-Host "`n$t" -ForegroundColor Cyan }
function Fail($m) { Write-Host "`nERRO: $m" -ForegroundColor Red; if ($env:SENTINEL_INSTALL_TEST -ne '1' -and $env:CI -ne 'true') { Read-Host 'Pressione ENTER para fechar' | Out-Null }; exit 1 }

try {
  try { $locked = $installMutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $locked = $true }
  if (-not $locked) { throw 'Outra instalacao do Sentinel esta em andamento. Aguarde ela terminar.' }
  New-Item -ItemType Directory -Force -Path $stage | Out-Null
  if ($LocalPayload -and (Test-Path $LocalPayload)) { Copy-Item $LocalPayload $payloadZip -Force }
  else {
    $cacheTag = if ($ExpectedBuild) { $ExpectedBuild } else { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString() }
    Invoke-WebRequest -UseBasicParsing "$site/downloads/agent_payload_v88.zip?v=$([Uri]::EscapeDataString($cacheTag))" -OutFile $payloadZip
  }
  Expand-Archive -LiteralPath $payloadZip -DestinationPath $payloadTmp -Force
  $manifest = Get-Content (Join-Path $payloadTmp 'package.json') -Raw | ConvertFrom-Json
  $agentRelease = Get-Content (Join-Path $payloadTmp 'release.json') -Raw | ConvertFrom-Json
  # The EXE embeds the build identity together with the ZIP. Never hardcode
  # a release number in this installer: the two must be verified as a pair.
  $expectedVersion = if ($ExpectedVersion) { $ExpectedVersion } else { [string]$agentRelease.version }
  $expectedBuild = if ($ExpectedBuild) { $ExpectedBuild } else { [string]$agentRelease.build }
  if ([string]::IsNullOrWhiteSpace($expectedVersion) -or [string]::IsNullOrWhiteSpace($expectedBuild) -or
      $manifest.version -ne $agentRelease.version -or
      $agentRelease.version -ne $expectedVersion -or $agentRelease.build -ne $expectedBuild) {
    throw "Pacote do Agent nao corresponde a esta instalacao $expectedVersion."
  }
  if ($VerifyPayloadOnly) {
    Write-Host "PACOTE VALIDADO: $expectedVersion / $expectedBuild" -ForegroundColor Green
    exit 0
  }
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
  Write-Host "       SENTINEL WINDOWS AGENT V$expectedVersion" -ForegroundColor White
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

  # 13.7.2: Start and verify the real Agent manager DIRECTLY. The tray and
  # watchdog are observers: neither is permitted to be the only startup path.
  # A desktop tray crash must never leave the Windows worker silently offline.
  $env:SENTINEL_WORKER_HOST='127.0.0.1'
  $env:SENTINEL_WORKER_PORT='8787'
  $env:SENTINEL_MANAGER_PORT='8788'
  $env:SENTINEL_ALLOWED_ORIGINS='https://sentinel-trading-lab.vercel.app,https://sentinel-trading-lab-iguassu-shop.vercel.app'
  foreach ($script in @(
      $manager,
      (Join-Path $root 'worker\index.mjs'),
      (Join-Path $root 'src\core\runtime.mjs'),
      (Join-Path $root 'src\core\causal-interval-forecast-1371.mjs')
  )) {
    if (-not (Test-Path -LiteralPath $script)) { throw "Modulo ausente no pacote: $script" }
    & $node --check $script
    if ($LASTEXITCODE -ne 0) { throw "Erro de sintaxe no Agent: $script" }
  }
  $managerStdout = Join-Path $dataDir 'manager-start-stdout.log'
  $managerStderr = Join-Path $dataDir 'manager-start-stderr.log'
  $managerProcess = Start-Process -FilePath $node -ArgumentList @("`"$manager`"") `
    -WorkingDirectory $root -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $managerStdout -RedirectStandardError $managerStderr
  if (-not $managerProcess -or $managerProcess.Id -le 0) {
    throw 'Falha ao executar o gerenciador Node do Sentinel.'
  }
  $ready=$false
  $managerHealth=$null
  for ($i=0; $i -lt 120; $i++) {
    try {
      $managerHealth = Invoke-RestMethod -UseBasicParsing 'http://127.0.0.1:8788/health' -TimeoutSec 1
      if ($managerHealth.ok -and $managerHealth.workerHealthy -and
        $managerHealth.version -eq $expectedVersion -and $managerHealth.build -eq $expectedBuild) {
        $ready = $true
        break
      }
    } catch {}
    $managerProcess.Refresh()
    if ($managerProcess.HasExited) { break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) {
    foreach ($log in @($managerStderr,
        (Join-Path $dataDir 'worker.log'),
        (Join-Path $dataDir 'manager.log'))) {
      if (Test-Path -LiteralPath $log) {
        Write-Host ("ERRO DETALHADO: " + $log) -ForegroundColor Yellow
        Get-Content -LiteralPath $log -Tail 14 -ErrorAction SilentlyContinue |
          ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
      }
    }
    if ($managerHealth -and $managerHealth.lastExit) {
      Write-Host ("Ultimo Worker: " + ($managerHealth.lastExit | ConvertTo-Json -Compress)) -ForegroundColor Yellow
    }
    throw "Agent $expectedVersion nao iniciou: consulte worker.log e manager.log. O instalador exibiu o erro de inicializacao acima."
  }

  # Only AFTER /health confirms matching version, build and actual child PID
  # enable tray icon and recovery watchdog. Avoid duplicate manager startups.
  if ($env:SENTINEL_INSTALL_TEST -ne '1') {
    $watchdogHost = Join-Path $root 'worker\watchdog-host.ps1'
    $runCmd = "powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$tray`""
    $watchdogCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watchdogHost`""
    New-Item -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Force | Out-Null
    Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'SentinelTradingLab' -Value $runCmd -Force
    Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'SentinelTradingLabWatchdog' -Value $watchdogCmd -Force
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-STA','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',"`"$tray`"") -WindowStyle Hidden | Out-Null
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',"`"$watchdogHost`"") -WindowStyle Hidden | Out-Null
  }

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
  Write-Host "`nAgent V$expectedVersion pronto." -ForegroundColor Green
  if ($env:SENTINEL_INSTALL_TEST -ne '1') {
    Write-Host 'O icone S fica na bandeja ao lado do relogio.' -ForegroundColor Green
    Write-Host 'Botao direito no icone: Abrir Sentinel, Ligar, Desligar, Reiniciar ou Desinstalar completamente.' -ForegroundColor Cyan
    Write-Host 'Se o Windows esconder o icone, clique na setinha ^ ao lado do relogio.' -ForegroundColor Yellow
    # Open the Sentinel broker-choice page, NEVER a default IQ/Exnova window.
    # The user's broker starts only from the explicit Corretora button.
    try { Start-Process 'https://sentinel-trading-lab.vercel.app/console?tab=Broker%20Connection' | Out-Null } catch {
      Write-Host 'Abra o Sentinel em: https://sentinel-trading-lab.vercel.app/console?tab=Broker%20Connection' -ForegroundColor Yellow
    }
    Start-Sleep -Seconds 2
  }
  exit 0
} catch { Fail $_.Exception.Message } finally {
  if ($locked) { try { $installMutex.ReleaseMutex() } catch {} }
  $installMutex.Dispose()
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
  if ($installTranscriptActive) { try { Stop-Transcript | Out-Null } catch {} }
}

