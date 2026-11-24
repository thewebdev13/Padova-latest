@echo off
setlocal EnableExtensions
title Padova WhatsApp Helper — RESTART
cd /d "%~dp0"

echo ============================================
echo   STOP old helper + START with new config
echo ============================================
echo.
echo Folder: %CD%
echo.

REM Kill whatever is listening on helper UI port (old process keeps old phones in memory)
powershell -NoProfile -Command ^
  "Get-NetTCPConnection -LocalPort 3927 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Start-Sleep -Seconds 1"

REM Also stop node running whatsapp-web-reader from this folder if still alive
powershell -NoProfile -Command ^
  "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'whatsapp-web-reader' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

echo Old helper stopped (if it was running).
echo.
echo Check phones in config.json then starting...
findstr /C:"assistant_phones" /C:"17325231744" /C:"13475630543" /C:"17322323322" config.json
echo.

call "%~dp0START.bat"
