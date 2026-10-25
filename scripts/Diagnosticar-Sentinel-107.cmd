@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0collect-sentinel-107-diagnostics.ps1" -IncludeStatus
pause
