param(
 [string]$AgentRoot = (Join-Path $env:LOCALAPPDATA 'SentinelTradingLab'),
 [ValidateRange(10,600)][int]$Seconds = 180,
 [switch]$IncludeStatus
)
$ErrorActionPreference = 'Stop'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$destination = Join-Path $PSScriptRoot ('sentinel-107-diagnostico-' + $stamp)
New-Item -ItemType Directory -Path $destination | Out-Null
function Read-Local([int]$Port, [string]$Path) {
 try { return Invoke-RestMethod -Uri ('http://127.0.0.1:'+$Port+$Path) -Method Get -TimeoutSec 2 } catch { return $null }
}
function Save-Json([string]$Name, $Value) {
 ConvertTo-Json -InputObject $Value -Depth 30 | Set-Content -LiteralPath (Join-Path $destination $Name) -Encoding UTF8
}
function Pick-Fields($Source, [string[]]$Keys) {
 if ($null -eq $Source) { return $null }
 $result=[ordered]@{}
 foreach ($key in $Keys) {
  if ($Source.PSObject.Properties.Name -contains $key) { $result[$key]=$Source.$key }
 }
 return $result
}
$worker = Read-Local 8787 '/health'
$manager = Read-Local 8788 '/health'
$workerProcessId = if ($worker) { [int]$worker.pid } else { 0 }
$identity = [ordered]@{
 collectedAt = (Get-Date).ToUniversalTime().ToString('o')
 worker = @{ version=$worker.version; build=$worker.build; processId=$workerProcessId }
 manager = @{ version=$manager.version; build=$manager.build; processId=$manager.managerPid; workerProcessId=$manager.workerPid; workerHealthy=$manager.workerHealthy }
 rootExists = (Test-Path -LiteralPath $AgentRoot)
 scope = 'Read-only local diagnostics; no trading, restart, update, credentials or browser DOM'
}
$releasePath = Join-Path $AgentRoot 'release.json'
if (Test-Path -LiteralPath $releasePath) {
 $release = Get-Content -LiteralPath $releasePath -Raw | ConvertFrom-Json
 $identity.disk = @{ version=$release.version; build=$release.build }
}
$hashes = @()
foreach ($relative in @('release.json','package.json','worker/index.mjs','worker/release.mjs','worker/signal-executor.mjs','worker/broker-ui-executor.mjs','worker/local-playwright-driver.mjs','worker/broker-native-expiry-keeper.mjs','src/core/runtime.mjs','src/core/now-opportunity-engine.mjs','src/core/historical-price-structure.mjs','src/core/causal-level-rejection-proof.mjs')) {
 $path = Join-Path $AgentRoot $relative
 if (Test-Path -LiteralPath $path) {
  $file = Get-Item -LiteralPath $path
  $hashes += @{ path=$relative; sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLower(); modifiedAt=$file.LastWriteTimeUtc.ToString('o') }
 }
}
Save-Json 'identity.json' $identity
Save-Json 'source-hashes.json' $hashes
Write-Host ('Coletando por '+$Seconds+' segundos. Nao altera o Agent nem executa operacoes.')
$samples = [System.Collections.Generic.List[object]]::new()
$started = Get-Date
$lastDiscovery = [datetime]::MinValue
$lastStatusRead = [datetime]::MinValue
$lastMarketQuotes = @{}
$marketFile = Join-Path $destination 'market-snapshots.jsonl'
$ids = @($workerProcessId) | Where-Object { $_ -gt 0 }
while (((Get-Date)-$started).TotalSeconds -lt $Seconds) {
 $now = Get-Date
 if (($now-$lastDiscovery).TotalSeconds -ge 20) {
  $lastDiscovery=$now
  try {
   $all = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId)
   $ids = @($workerProcessId) | Where-Object { $_ -gt 0 }
   for ($depth=0; $depth -lt 10; $depth++) {
    $children = @($all | Where-Object { $ids -contains [int]$_.ParentProcessId -and $ids -notcontains [int]$_.ProcessId } | ForEach-Object { [int]$_.ProcessId })
    if (!$children.Count) { break }
    $ids += $children
   }
  } catch {}
 }
 $processes = @()
 foreach ($processIdValue in $ids) {
  try {
   $p=Get-Process -Id $processIdValue -ErrorAction Stop
   $processes += @{ processId=$p.Id; kind=if ($p.Id -eq $workerProcessId) {'worker'} else {'descendant'}; cpuSeconds=$p.CPU; privateBytes=$p.PrivateMemorySize64; workingSetBytes=$p.WorkingSet64; handles=$p.HandleCount; threads=$p.Threads.Count; startedAt=$p.StartTime.ToUniversalTime().ToString('o') }
  } catch {}
 }
 $sample = @{ at=$now.ToUniversalTime().ToString('o'); processes=$processes }
 # Optional /status builds a runtime snapshot. Its sampling cost is included;
 # these are sampled last-cycle values, NOT a full p95/p99 of all cycles.
 if ($IncludeStatus -and ($now-$lastStatusRead).TotalSeconds -ge 10) {
  $lastStatusRead=$now
  $captureStart=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $status=Read-Local 8787 '/status'
  $captureEnd=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $sample.statusReadMs=$captureEnd-$captureStart
  if ($status.data) {
   $data=$status.data
   $sample.timing=$data.timingDiagnostics; $sample.journal=$data.marketJournal
   if ($data.liveBroker) {
    $market=$data.liveBroker
    $context=[string]$market.provider+'|'+[string]$market.symbol
    $after=if ($lastMarketQuotes.ContainsKey($context)) { $lastMarketQuotes[$context] } else { 0 }
    $quotes=@($market.quoteHistory | Where-Object { [double]$_.ts -ge $after } | ForEach-Object { Pick-Fields $_ @('ts','price','receivedAt') })
    if ($quotes.Count -gt 0) { $lastMarketQuotes[$context]=[double]$quotes[-1].ts }
    $cleanMarket=Pick-Fields $market @('provider','symbol','validatedSymbol','activeId','quote','quoteTs','lastQuoteAt','lastCandleAt','feedValidated','analysisFeedValidated','quoteFeedValidated','historicalCandlesVerified','candleIntegrity','expirationDurationMs','expirationKind','expirationUpdatedAt')
    $cleanMarket['quoteHistory']=$quotes
    $cleanMarket['candles']=@($market.candles | ForEach-Object { Pick-Fields $_ @('from','to','ts','open','high','low','close','receivedAt') })
    $vnext=$data.lastResult.analysis.vnext
    $frame=[ordered]@{
     schema='sentinel-readonly-market-snapshot-v1'; capturedFrom=$captureStart; capturedTo=$captureEnd
     agentVersion=$data.agentVersion; market=$cleanMarket
     settings=(Pick-Fields $data.settings @('asset','engine','orderDurationMs','forecastHorizonSeconds'))
     lastEvalMs=$data.lastEvalMs
     observation=(Pick-Fields $vnext.nowObservation @('side','ready','reason','observedAt','evaluatedAt','price','strength'))
     window=(Pick-Fields $vnext.opportunityWindow @('phase','reason','entryAt','exitAt','side','windowStartedAt','windowEndsAt'))
     entry=(Pick-Fields $vnext.futureEntryAnchor @('phase','side','entryAt','entryTriggeredAt','exitAt','entryPrice','confirmedEntryPrice','holdingSeconds'))
    }
    ConvertTo-Json -InputObject $frame -Depth 20 -Compress | Add-Content -LiteralPath $marketFile -Encoding UTF8
   }
  }
 }
 $samples.Add($sample)
 Start-Sleep -Seconds 2
}
Save-Json 'process-samples.json' $samples
$journal = Join-Path $AgentRoot 'worker/data/market-history'
$events = [System.Collections.Generic.List[object]]::new()
$allowedKeys = @('schema','release','type','ts','provider','asset','batchId','engine','directionMode','independent','side','durationMs','signalAt','signalPrice','snapshotQuote','snapshotQuoteAt','martingaleLevel','clickCount','structure','probability','localId','orderId','entryPrice','exitAt','netPnl','result','exitPrice','quote','quoteTs','quotes','candles','predictionCandles','volumeKind','settings')
if (Test-Path -LiteralPath $journal) {
 $files = @(Get-ChildItem -LiteralPath $journal -Filter '*.jsonl' | Sort-Object LastWriteTime -Descending | Select-Object -First 3)
 foreach ($file in $files) {
  if ($file.Length -gt 24MB) { continue }
  foreach ($line in (Get-Content -LiteralPath $file.FullName -Tail 5000)) {
   try {
    $event=$line | ConvertFrom-Json
    if ($event.type -notin @('trade_decision','broker_accepted','broker_settlement','market')) { continue }
    $clean=[ordered]@{}
    foreach ($key in $allowedKeys) { if ($event.PSObject.Properties.Name -contains $key) { $clean[$key]=$event.$key } }
    $events.Add($clean)
   } catch {}
  }
 }
}
Save-Json 'audit-events.json' $events
Save-Json 'limits.json' @{ windowsProfiler=$false; browserProfiler=$false; readOnly=$true; sampledTimingOnly=$true; marketSnapshotIntervalSeconds=10; exactQuoteReceiptTimes=$false; retrospectiveCausalReplayProven=$false; possibleMissingFiles=$true; sourceHashIsDiskNotLoadedMemory=$true }
$archive=$destination+'.zip'
Compress-Archive -LiteralPath $destination -DestinationPath $archive
Write-Host ('Concluido: '+$archive)
