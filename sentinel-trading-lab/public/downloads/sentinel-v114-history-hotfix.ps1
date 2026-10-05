param()
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$site='https://sentinel-trading-lab.vercel.app'
$root=Join-Path $env:LOCALAPPDATA 'SentinelTradingLab'
$tmp=Join-Path $env:TEMP 'sentinel-v114-history-hotfix'
$driverDst=Join-Path $root 'worker\local-playwright-driver.mjs'
$adapterDst=Join-Path $root 'worker\adapters\browser-broker.mjs'

function Fail($m){
  try {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($m,'Sentinel V11.4') | Out-Null
  } catch {}
  throw $m
}

try {
  if(-not (Test-Path $driverDst) -or -not (Test-Path $adapterDst)){
    $exe=Join-Path $env:TEMP 'Sentinel-Agent-Windows-V11.4.exe'
    Invoke-WebRequest -UseBasicParsing "$site/downloads/Sentinel-Agent-Windows.exe?v=11.4.0-base" -OutFile $exe
    Start-Process -FilePath $exe -Wait
  }
  if(-not (Test-Path $driverDst) -or -not (Test-Path $adapterDst)){ Fail 'O Agent V11.4 nao foi encontrado neste PC.' }

  if(Test-Path $tmp){Remove-Item $tmp -Recurse -Force}
  New-Item -ItemType Directory -Force -Path (Join-Path $tmp 'adapters') | Out-Null

  $driverNew=Join-Path $tmp 'local-playwright-driver.mjs'
  $adapterNew=Join-Path $tmp 'adapters\browser-broker.mjs'
  Invoke-WebRequest -UseBasicParsing "$site/downloads/hotfix-v114/local-playwright-driver.mjs?v=history-2" -OutFile $driverNew
  Invoke-WebRequest -UseBasicParsing "$site/downloads/hotfix-v114/browser-broker.mjs?v=history-2" -OutFile $adapterNew

  $driverText=Get-Content -LiteralPath $driverNew -Raw
  if($driverText -notlike '*data?.msg?.candles*'){ Fail 'Hotfix incompleto: parser de historico nao encontrado.' }

  $stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
  Copy-Item $driverDst "$driverDst.bak-$stamp" -Force
  Copy-Item $adapterDst "$adapterDst.bak-$stamp" -Force

  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine -like '*SentinelTradingLab*' -and
    ($_.CommandLine -like '*worker*index.mjs*' -or $_.CommandLine -like '*agent-manager.mjs*')
  } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }

  Start-Sleep -Milliseconds 600
  Copy-Item $driverNew $driverDst -Force
  Copy-Item $adapterNew $adapterDst -Force

  $ready=$false
  for($i=0;$i -lt 24;$i++){
    try{
      $h=Invoke-RestMethod -UseBasicParsing 'http://127.0.0.1:8788/health' -TimeoutSec 1
      if($h.ok -and $h.workerHealthy){$ready=$true;break}
    }catch{}
    Start-Sleep -Milliseconds 500
  }

  if(-not $ready){
    $node=Join-Path $root '.sentinel-runtime\node.exe'
    $manager=Join-Path $root 'worker\agent-manager.mjs'
    if(Test-Path $node -and Test-Path $manager){
      Start-Process -FilePath $node -ArgumentList @($manager) -WorkingDirectory $root -WindowStyle Hidden | Out-Null
    }
    for($i=0;$i -lt 24;$i++){
      try{
        $h=Invoke-RestMethod -UseBasicParsing 'http://127.0.0.1:8788/health' -TimeoutSec 1
        if($h.ok -and $h.workerHealthy){$ready=$true;break}
      }catch{}
      Start-Sleep -Milliseconds 500
    }
  }

  if(-not $ready){ Fail 'Arquivos atualizados, mas o Worker nao reiniciou. Reinicie o Sentinel pelo icone S.' }

  try{
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show('Correcao V11.4 aplicada. O historico de candles agora le msg.candles e o Worker foi reiniciado.','Sentinel V11.4') | Out-Null
  }catch{}
} catch {
  Fail ("Falha ao aplicar a correcao V11.4: " + $_.Exception.Message)
}
