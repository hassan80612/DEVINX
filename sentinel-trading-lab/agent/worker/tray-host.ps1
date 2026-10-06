$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$node = Join-Path $root '.sentinel-runtime\node.exe'
$manager = Join-Path $root 'worker\agent-manager.mjs'
$iconPath = Join-Path $root 'worker\sentinel.ico'
$exitMarker = Join-Path $root 'worker\data\agent.exit'
$site = 'https://sentinel-trading-lab.vercel.app'
$managerHealth = 'http://127.0.0.1:8788/health'
$agentEnabled = $true

# Mantém o controlador/ícone disponível após novo login do Windows.
try {
  $runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
  $runCmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$($MyInvocation.MyCommand.Path)`""
  New-Item -Path $runKey -Force | Out-Null
  Set-ItemProperty -Path $runKey -Name 'SentinelTradingLab' -Value $runCmd -Force
} catch {}

$created = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\SentinelTradingLabTrayV880', [ref]$created)
if (-not $created) { exit 0 }
if (Test-Path $exitMarker) { Remove-Item $exitMarker -Force -ErrorAction SilentlyContinue }

function Start-Manager {
  try {
    if (Test-Path $exitMarker) { Remove-Item $exitMarker -Force -ErrorAction SilentlyContinue }
    $env:SENTINEL_WORKER_HOST = '127.0.0.1'
    $env:SENTINEL_WORKER_PORT = '8787'
    $env:SENTINEL_MANAGER_PORT = '8788'
    $env:SENTINEL_ALLOWED_ORIGINS = 'https://sentinel-trading-lab.vercel.app,https://sentinel-trading-lab-iguassu-shop.vercel.app'
    Start-Process -FilePath $node -ArgumentList @($manager) -WorkingDirectory $root -WindowStyle Hidden | Out-Null
  } catch {}
}
function Get-Health { try { return Invoke-RestMethod -UseBasicParsing $managerHealth -TimeoutSec 1 } catch { return $null } }
function Stop-Agent { try { Invoke-RestMethod -UseBasicParsing 'http://127.0.0.1:8788/exit' -Method Post -TimeoutSec 2 | Out-Null } catch {} }
function Restart-Worker { try { return Invoke-RestMethod -UseBasicParsing 'http://127.0.0.1:8788/restart' -Method Post -TimeoutSec 8 } catch { return $null } }
function Start-Worker { try { return Invoke-RestMethod -UseBasicParsing 'http://127.0.0.1:8788/start' -Method Post -TimeoutSec 8 } catch { return $null } }

if (-not (Get-Health)) { Start-Manager }

$notify = New-Object System.Windows.Forms.NotifyIcon
try { $notify.Icon = New-Object System.Drawing.Icon($iconPath) } catch { $notify.Icon = [System.Drawing.SystemIcons]::Application }
$notify.Text = 'Sentinel Agent V12'
$notify.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$statusItem = New-Object System.Windows.Forms.ToolStripMenuItem
$statusItem.Text = 'Status: iniciando...'; $statusItem.Enabled = $false
$accessItem = New-Object System.Windows.Forms.ToolStripMenuItem
$accessItem.Text = 'Acesso: verificando...'; $accessItem.Enabled = $false
$openItem = New-Object System.Windows.Forms.ToolStripMenuItem
$openItem.Text = 'Abrir Sentinel'
$startItem = New-Object System.Windows.Forms.ToolStripMenuItem
$startItem.Text = 'Ligar Agent'
$stopItem = New-Object System.Windows.Forms.ToolStripMenuItem
$stopItem.Text = 'Desligar Agent'
$restartAgentItem = New-Object System.Windows.Forms.ToolStripMenuItem
$restartAgentItem.Text = 'Reiniciar Agent'
$restartWorkerItem = New-Object System.Windows.Forms.ToolStripMenuItem
$restartWorkerItem.Text = 'Reiniciar Worker'
$uninstallItem = New-Object System.Windows.Forms.ToolStripMenuItem
$uninstallItem.Text = 'Desinstalar Sentinel completamente'
$pairItem = New-Object System.Windows.Forms.ToolStripMenuItem
$pairItem.Text = 'Vincular conta: aguardando...'
$pairItem.Enabled = $false
[void]$menu.Items.Add($statusItem)
[void]$menu.Items.Add($accessItem)
[void]$menu.Items.Add('-')
[void]$menu.Items.Add($openItem)
[void]$menu.Items.Add($pairItem)
[void]$menu.Items.Add($startItem)
[void]$menu.Items.Add($stopItem)
[void]$menu.Items.Add($restartAgentItem)
[void]$menu.Items.Add($restartWorkerItem)
[void]$menu.Items.Add('-')
[void]$menu.Items.Add($uninstallItem)
$notify.ContextMenuStrip = $menu

$openItem.Add_Click({ Start-Process $site })
$startItem.Add_Click({
  $script:agentEnabled = $true
  $statusItem.Text = 'Status: ligando Agent...'
  if (-not (Get-Health)) { Start-Manager; Start-Sleep -Milliseconds 600 }
  Start-Worker | Out-Null
})
$stopItem.Add_Click({
  $script:agentEnabled = $false
  $statusItem.Text = 'Status: Agent desligado pelo usuário'
  Stop-Agent
})
$restartAgentItem.Add_Click({
  $script:agentEnabled = $true
  $statusItem.Text = 'Status: reiniciando Agent...'
  Stop-Agent
  Start-Sleep -Milliseconds 700
  Start-Manager
})
$restartWorkerItem.Add_Click({
  $script:agentEnabled = $true
  $statusItem.Text = 'Status: reiniciando Worker...'
  if (-not (Get-Health)) { Start-Manager; Start-Sleep -Milliseconds 600 }
  Restart-Worker | Out-Null
})

$uninstallItem.Add_Click({
  $nl = [Environment]::NewLine
  $message = 'Isso vai remover o Sentinel Agent deste PC, incluindo o Worker, perfil local da corretora, vínculo local e inicialização automática.' + $nl + $nl + 'Deseja continuar?'
  $answer = [System.Windows.Forms.MessageBox]::Show($message,'Desinstalar Sentinel',[System.Windows.Forms.MessageBoxButtons]::YesNo,[System.Windows.Forms.MessageBoxIcon]::Warning)
  if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) { return }
  $script:agentEnabled = $false
  $statusItem.Text = 'Status: desinstalando Sentinel...'
  try {
    Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'SentinelTradingLab' -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'SentinelTradingLabWatchdog' -ErrorAction SilentlyContinue
  } catch {}
  Stop-Agent
  Start-Sleep -Milliseconds 700
  $rootQuoted = $root.Replace("'", "''")
  $cleanup = @'
Start-Sleep -Seconds 2
try {
  Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'SentinelTradingLab' -ErrorAction SilentlyContinue
  Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'SentinelTradingLabWatchdog' -ErrorAction SilentlyContinue
} catch {}
try {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine -like '*SentinelTradingLab*'
  } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {}
try {
  Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -like 'Sentinel*' } | Unregister-ScheduledTask -Confirm:$false -ErrorAction SilentlyContinue
} catch {}
Start-Sleep -Milliseconds 700
Remove-Item -LiteralPath '__ROOT__' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $env:LOCALAPPDATA 'SentinelTradingLabIdentity') -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $env:TEMP 'SentinelAgentV88') -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $env:TEMP 'sentinel-agent-v86-payload.zip') -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $env:TEMP 'sentinel-agent-v86-payload') -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $env:TEMP 'sentinel-agent-v87-payload.zip') -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $env:TEMP 'sentinel-agent-v87-payload') -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $env:TEMP 'sentinel-agent-v88-payload.zip') -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $env:TEMP 'sentinel-agent-v88-payload') -Recurse -Force -ErrorAction SilentlyContinue
'@
  $cleanup = $cleanup.Replace('__ROOT__',$rootQuoted)
  Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-Command',$cleanup) -WindowStyle Hidden | Out-Null
  $notify.Visible = $false
  $timer.Stop()
  [System.Windows.Forms.Application]::Exit()
})
$pairItem.Add_Click({ if ($pairItem.Tag) { [System.Windows.Forms.Clipboard]::SetText([string]$pairItem.Tag); Start-Process ($site + '/?pair=' + [uri]::EscapeDataString([string]$pairItem.Tag)) } })
$notify.Add_DoubleClick({ Start-Process $site })

$failCount = 0
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2500
$timer.Add_Tick({
  if (Test-Path $exitMarker) { Remove-Item $exitMarker -Force -ErrorAction SilentlyContinue; $script:agentEnabled = $false }
  $h = Get-Health
  try {
    $ri = Invoke-RestMethod -UseBasicParsing 'http://127.0.0.1:8787/remote-info' -TimeoutSec 1
    if ($ri -and $ri.paired) {
      $pairItem.Text = 'Conta vinculada'; $pairItem.Enabled = $false; $pairItem.Tag = $null
      if ($ri.accessActive -eq $true) { $accessItem.Text = 'Acesso: ATIVO' }
      else { $accessItem.Text = 'Acesso: BLOQUEADO' }
    }
    elseif ($ri -and $ri.pairingCode) {
      $pairItem.Text = 'Vincular conta: ' + $ri.pairingCode; $pairItem.Enabled = $true; $pairItem.Tag = $ri.pairingCode
      $accessItem.Text = 'Acesso: aguardando vínculo'
    }
    else {
      $pairItem.Text = 'Vincular conta: aguardando...'; $pairItem.Enabled = $false; $pairItem.Tag = $null
      $accessItem.Text = 'Acesso: aguardando vínculo'
    }
  } catch {}
  if ($h -and $h.ok) {
    $failCount = 0
    $script:agentEnabled = $true
    if ($h.workerHealthy) {
      $statusItem.Text = 'Status: Agent + Worker ONLINE'
      $notify.Text = 'Sentinel Agent - ONLINE'
    } elseif ($h.workerEnabled -eq $false) {
      $statusItem.Text = 'Status: Agent ligado / Worker pausado'
      $notify.Text = 'Sentinel Agent - Worker pausado'
    } else {
      $statusItem.Text = 'Status: Agent online / Worker iniciando'
      $notify.Text = 'Sentinel Agent - Worker iniciando'
    }
  } else {
    if (-not $script:agentEnabled) {
      $statusItem.Text = 'Status: Agent DESLIGADO'
      $notify.Text = 'Sentinel Agent - DESLIGADO'
      return
    }
    $failCount++
    $statusItem.Text = 'Status: recuperando Agent...'
    $notify.Text = 'Sentinel Agent - recuperando'
    if ($failCount -ge 2) { Start-Manager; $failCount = 0 }
  }
})
$timer.Start()

$notify.BalloonTipTitle = 'Sentinel Agent'
$notify.BalloonTipText = 'Controlador ativo na bandeja. Botão direito: ligar, desligar, reiniciar ou abrir o Sentinel.'
$notify.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
$notify.ShowBalloonTip(4500)

[System.Windows.Forms.Application]::Run()
$timer.Stop(); $notify.Visible = $false; $notify.Dispose()
try { $mutex.ReleaseMutex() } catch {}
$mutex.Dispose()
