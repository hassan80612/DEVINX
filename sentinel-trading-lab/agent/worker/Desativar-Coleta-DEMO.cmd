@echo off
set "DATA=%~dp0data"
if not exist "%DATA%" mkdir "%DATA%"
> "%DATA%\demo-quotes-disabled.flag" echo stopped-by-user
echo Coleta local DEMO desativada. Nao e necessario fechar o Sentinel.
echo Os arquivos de cotacao anteriores continuam em worker\data\market-history.
pause
