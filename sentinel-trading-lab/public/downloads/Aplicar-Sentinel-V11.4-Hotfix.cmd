@echo off
setlocal
title Sentinel V11.4 - Correcao de historico
echo Aplicando correcao do Sentinel V11.4...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$u='https://sentinel-trading-lab.vercel.app/downloads/sentinel-v114-history-hotfix.ps1?v=history-2';$p=Join-Path $env:TEMP 'sentinel-v114-history-hotfix.ps1';Invoke-WebRequest -UseBasicParsing $u -OutFile $p;& $p"
if errorlevel 1 (
  echo.
  echo Nao foi possivel aplicar a correcao.
  pause
  exit /b 1
)
echo.
echo Correcao aplicada.
timeout /t 2 /nobreak >nul
exit /b 0
