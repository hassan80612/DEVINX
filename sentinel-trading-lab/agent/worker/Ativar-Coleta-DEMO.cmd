@echo off
set "DATA=%~dp0data"
if exist "%DATA%\demo-quotes-disabled.flag" del /f /q "%DATA%\demo-quotes-disabled.flag"
echo Coleta local reativada somente para conta DEMO confirmada.
echo Conta REAL ou modo desconhecido nunca e gravado.
pause
