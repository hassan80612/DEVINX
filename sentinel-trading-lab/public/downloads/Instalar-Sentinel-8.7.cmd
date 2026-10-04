@echo off
setlocal
cd /d "%~dp0"
echo ========================================
echo        SENTINEL WINDOWS AGENT V8.7
echo ========================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-agent-v87.ps1" -LocalPayload "%~dp0agent_payload_v87.zip"
if errorlevel 1 (
  echo.
  echo A instalacao nao foi concluida.
  pause
  exit /b 1
)
endlocal
