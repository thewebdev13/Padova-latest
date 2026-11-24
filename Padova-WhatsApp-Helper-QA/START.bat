@echo off
setlocal EnableExtensions
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

REM Standard installs + common NVM (Author Software / nvm-windows)
set "PATH=%ProgramFiles%\nodejs;%LocalAppData%\Programs\nodejs;%LocalAppData%\Author Software\nvm\.nodejs;%APPDATA%\nvm;%PATH%"
set "PF86=%ProgramFiles(x86)%"
if defined PF86 set "PATH=%PF86%\nodejs;%PATH%"
if exist "%LocalAppData%\Author Software\nvm\.nodejs" set "PATH=%LocalAppData%\Author Software\nvm\.nodejs;%PATH%"

set "NODE_EXE="
set "NPM_EXE="

for %%P in (
  "%LocalAppData%\Author Software\nvm\.nodejs\node.exe"
  "%ProgramFiles%\nodejs\node.exe"
  "%LocalAppData%\Programs\nodejs\node.exe"
) do if not defined NODE_EXE if exist %%~P set "NODE_EXE=%%~P"

if not defined NODE_EXE (
  for /f "delims=" %%i in ('where node.exe 2^>nul') do (
    if not defined NODE_EXE set "NODE_EXE=%%i"
  )
)

if not defined NODE_EXE goto NO_NODE

for %%I in ("%NODE_EXE%") do set "NODE_DIR=%%~dpI"

REM NVM ships npm.exe; official installer ships npm.cmd — accept both
if exist "%NODE_DIR%npm.exe" set "NPM_EXE=%NODE_DIR%npm.exe"
if not defined NPM_EXE if exist "%NODE_DIR%npm.cmd" set "NPM_EXE=%NODE_DIR%npm.cmd"
if not defined NPM_EXE if exist "%LocalAppData%\Author Software\nvm\.nodejs\npm.exe" set "NPM_EXE=%LocalAppData%\Author Software\nvm\.nodejs\npm.exe"
if not defined NPM_EXE (
  for /f "delims=" %%i in ('where npm.exe 2^>nul') do (
    if not defined NPM_EXE set "NPM_EXE=%%i"
  )
)
if not defined NPM_EXE (
  for /f "delims=" %%i in ('where npm.cmd 2^>nul') do (
    if not defined NPM_EXE set "NPM_EXE=%%i"
  )
)

set "NPM_CLI=%NODE_DIR%node_modules\npm\bin\npm-cli.js"

echo Node: %NODE_EXE%
"%NODE_EXE%" -v
if defined NPM_EXE (
  echo npm:  %NPM_EXE%
) else if exist "%NPM_CLI%" (
  echo npm:  via npm-cli.js
) else (
  goto NO_NPM
)
echo.

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
echo First time install - please wait (needs internet once)...
if defined NPM_EXE (
  call "%NPM_EXE%" install --no-fund --no-audit
) else (
  "%NODE_EXE%" "%NPM_CLI%" install --no-fund --no-audit
)
if errorlevel 1 goto INSTALL_FAIL

:RUN
echo Starting helper (one process)...
echo Browser will open when ready.
echo.
"%NODE_EXE%" whatsapp-web-reader.mjs
set ERR=%ERRORLEVEL%
echo.
echo Helper stopped. Code=%ERR%
goto END

:NO_NODE
echo.
echo ERROR: Node.js not found for this window.
echo PowerShell me node -v OK ho to naya START.bat use karo / PATH refresh.
echo.
goto END

:NO_NPM
echo.
echo ERROR: node mila, npm nahi.
echo PowerShell: npm -v   where.exe npm
echo.
goto END

:MISSING
echo ERROR: Missing required files in this folder.
echo Nested folder mat use karo. START.bat + config.json same folder me hone chahiye.
goto END

:INSTALL_FAIL
echo.
echo ERROR: npm install failed. Internet check, phir START.bat again.
echo.
goto END

:END
echo.
pause
endlocal
