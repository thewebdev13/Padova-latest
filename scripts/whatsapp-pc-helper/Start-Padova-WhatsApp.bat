@echo off
REM Double-click on Windows: starts the read-only WhatsApp → Padova draft helper.
cd /d "%~dp0..\.."
echo Padova WhatsApp helper (read-only - drafts). Never sends.
echo A browser page will open on this PC with the QR code.
echo Leave this window open. Press Ctrl+C to stop.
echo.
where npm >nul 2>&1
if errorlevel 1 (
  echo Node/npm not found. Ask the developer to install Node.js 24 on this PC.
  pause
  exit /b 1
)
call npm run intake:whatsapp-helper
echo.
pause
