param([string]$LocalPayload='')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$site = 'https://sentinel-trading-lab.vercel.app'
$root = Join-Path $env:LOCALAPPDATA 'SentinelTradingLab'
$runtime = Join-Path $root '.sentinel-runtime'
$payloadZip = Join-Path $env:TEMP 'sentinel-agent-v87-payload.zip'
$payloadTmp = Join-Path $env:TEMP 'sentinel-agent-v87-payload'

function Step($t) { Write-Host "`n$t" -ForegroundColor Cyan }
function Fail($m) { Write-Host "`nERRO: $m" -ForegroundColor Red; Read-Host 'Pressione ENTER para fechar'; exit 1 }

try {
  Write-Host '========================================' -ForegroundColor DarkCyan
  Write-Host '       SENTINEL WINDOWS AGENT V8.7.0' -ForegroundColor White
  Write-Host '       Agent + Worker background + icone na bandeja' -ForegroundColor Gray
  Write-Host '========================================' -ForegroundColor DarkCyan

  Step '1/5 Atualizando arquivos do Agent...'
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  if ($LocalPayload -and (Test-Path $LocalPayload)) { Copy-Item $LocalPayload $payloadZip -Force }
  else { Invoke-WebRequest -UseBasicParsing "$site/downloads/agent_payload_v87.zip?v=8.7.0&t=agt_v87_bg_20261004" -OutFile $payloadZip }
  if (Test-Path $payloadTmp) { Remove-Item $payloadTmp -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $payloadTmp | Out-Null
  Expand-Archive -LiteralPath $payloadZip -DestinationPath $payloadTmp -Force
  Copy-Item (Join-Path $payloadTmp '*') $root -Recurse -Force

  $node = Join-Path $runtime 'node.exe'
  $npm = Join-Path $runtime 'npm.cmd'
  if (-not (Test-Path $node)) {
    Step '2/5 Baixando Node LTS local (somente na primeira vez)...'
    $releases = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
    $release = $releases | Where-Object { $_.lts -and ($_.files -contains 'win-x64-zip') } | Select-Object -First 1
    if (-not $release) { throw 'Nao foi encontrada uma versao Node LTS para Windows x64.' }
    $nodeZip = Join-Path $env:TEMP 'sentinel-node.zip'
    $nodeTmp = Join-Path $env:TEMP 'sentinel-node'
    Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$($release.version)/node-$($release.version)-win-x64.zip" -OutFile $nodeZip
    if (Test-Path $nodeTmp) { Remove-Item $nodeTmp -Recurse -Force }
    if (Test-Path $runtime) { Remove-Item $runtime -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $nodeTmp,$runtime | Out-Null
    Expand-Archive -LiteralPath $nodeZip -DestinationPath $nodeTmp -Force
    $nodeFolder = Get-ChildItem $nodeTmp -Directory | Select-Object -First 1
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

  Step '5/5 Iniciando Agent na bandeja do Windows...'
  $tray = Join-Path $root 'worker\tray-host.ps1'
  $runCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$tray`""
  New-Item -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Force | Out-Null
  Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'SentinelTradingLab' -Value $runCmd -Force
  Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',$tray) -WindowStyle Hidden | Out-Null

  $ready = $false
  for ($i=0; $i -lt 45; $i++) {
    try {
      $h = Invoke-RestMethod -UseBasicParsing 'http://127.0.0.1:8788/health' -TimeoutSec 1
      if ($h.ok -and $h.workerHealthy) { $ready = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 300
  }
  if (-not $ready) { throw 'Agent abriu, mas o Worker nao respondeu. Execute novamente o Agent V8.7.0.' }

  Write-Host "`nAgent V8.7.0 pronto. O icone S fica na bandeja ao lado do relogio." -ForegroundColor Green
  Write-Host 'Botao direito no icone: Abrir Sentinel, Ligar, Desligar, Reiniciar ou Desinstalar completamente.' -ForegroundColor Cyan
  Write-Host 'Se o Windows esconder o icone, clique na setinha ^ ao lado do relogio.' -ForegroundColor Yellow
  Start-Sleep -Seconds 3
  exit 0
} catch { Fail $_.Exception.Message }
