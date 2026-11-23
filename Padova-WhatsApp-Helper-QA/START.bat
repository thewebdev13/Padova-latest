@echo off
title Padova WhatsApp Helper
cd /d "%~dp0"

echo ============================================
echo   Padova WhatsApp Helper
echo   Click START.bat ONLY ONCE
echo   Keep this ONE window open
echo ============================================
echo.
echo Folder: %CD%
echo.

set "PADOVA_WHATSAPP_BRIDGE_URL="
set "PADOVA_WHATSAPP_BRIDGE_TOKEN="
set "PADOVA_WHATSAPP_ACTOR_ID="
set "PADOVA_WHATSAPP_REMINDERS_URL="
set "PADOVA_WHATSAPP_ALLOW_OWNER_ALERTS="

set "PATH=%ProgramFiles%\nodejs;%PATH%"
set "PF86=%ProgramFiles(x86)%"
if defined PF86 set "PATH=%PF86%\nodejs;%PATH%"
set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"

where node.exe >nul 2>&1
if errorlevel 1 goto NO_NODE

REM If already running: open browser once, do NOT start second process
powershell -NoProfile -Command "try { $c = Get-NetTCPConnection -LocalPort 3927 -State Listen -ErrorAction Stop; if ($c) { exit 0 } else { exit 1 } } catch { exit 1 }"
if %ERRORLEVEL%==0 (
  echo Helper is ALREADY running.
  echo Opening browser only - do not start a second helper.
  start "" "http://127.0.0.1:3927/"
  echo.
  pause
  exit /b 0
)

if not exist "whatsapp-web-reader.mjs" goto MISSING
if not exist "config.json" goto MISSING
if not exist "package.json" goto MISSING

if exist "node_modules\@whiskeysockets" goto RUN
echo First time install - please wait...
call npm.cmd install --no-fund --no-audit
if errorlevel 1 goto INSTALL_FAIL

:RUN
echo Starting helper (one process)...
echo Browser will open when ready.
echo.
node.exe whatsapp-web-reader.mjs
set ERR=%ERRORLEVEL%
echo.
echo Helper stopped. Code=%ERR%
goto END

:NO_NODE
echo ERROR: Install Node.js 24 from https://nodejs.org then restart PC.
goto END

:MISSING
echo ERROR: Missing required files in this folder.
goto END

:INSTALL_FAIL
echo ERROR: npm install failed. Need internet.
goto END

:END
echo.
pause
