@echo off
title Padova WhatsApp Helper
cd /d "%~dp0"

echo ============================================
echo   Padova WhatsApp helper - Windows
echo   Keep this window open
echo ============================================
echo.
echo Folder: %CD%
echo.

set "PADOVA_WHATSAPP_BRIDGE_URL="
set "PADOVA_WHATSAPP_BRIDGE_TOKEN="
set "PADOVA_WHATSAPP_ACTOR_ID="
set "PADOVA_WHATSAPP_REMINDERS_URL="
set "PADOVA_WHATSAPP_ALLOW_OWNER_ALERTS="
set "PADOVA_WHATSAPP_OWNER_PHONES="
set "PADOVA_WA_ASSISTANT_PHONES="

REM Put Node on PATH (no parentheses IF blocks - (x86) breaks cmd)
set "PATH=%ProgramFiles%\nodejs;%PATH%"
set "PF86=%ProgramFiles(x86)%"
if defined PF86 set "PATH=%PF86%\nodejs;%PATH%"
set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"

where npm.cmd >nul 2>&1
if errorlevel 1 goto NO_NPM
goto NPM_OK

:NO_NPM
echo ERROR: Node.js / npm not found.
echo Install Node.js 24 LTS from https://nodejs.org
echo Then RESTART the PC and run this file again.
goto END

:NPM_OK
echo npm OK
where npm.cmd
echo.

if not exist "package.json" goto NO_PKG
if not exist "scripts\whatsapp-web-reader.mjs" goto NO_READER
if not exist "scripts\whatsapp-pc-helper\config.json" goto NO_CONFIG
goto FILES_OK

:NO_PKG
echo ERROR: package.json missing. Open the INNER unzipped folder.
goto END

:NO_READER
echo ERROR: scripts\whatsapp-web-reader.mjs missing.
echo The scripts folder is required. Do not delete it.
goto END

:NO_CONFIG
echo ERROR: scripts\whatsapp-pc-helper\config.json missing.
goto END

:FILES_OK
if exist "node_modules\@whiskeysockets" goto RUN
echo First run: installing packages (needs internet)...
echo.
call npm.cmd install
if errorlevel 1 goto INSTALL_FAIL
echo.
goto RUN

:INSTALL_FAIL
echo ERROR: npm install failed. Check internet / antivirus.
goto END

:RUN
echo Starting helper...
echo Open http://127.0.0.1:3927/ if browser does not open.
echo Scan QR once, wait for Connected.
echo.
call npm.cmd run intake:whatsapp-helper
echo.
echo Helper stopped. Code=%ERRORLEVEL%

:END
echo.
echo --------------------------------------------
echo Press any key to close this window.
echo --------------------------------------------
pause
