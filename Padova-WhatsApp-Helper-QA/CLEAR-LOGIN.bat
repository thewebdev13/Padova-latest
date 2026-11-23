@echo off
title Padova WhatsApp - Clear Login
cd /d "%~dp0"
echo This removes the saved WhatsApp login on THIS PC.
echo Next START.bat will show a new QR to scan.
echo.
pause
rmdir /s /q "%USERPROFILE%\.padova\owner-pc-helper\whatsapp-web-auth" 2>nul
mkdir "%USERPROFILE%\.padova\owner-pc-helper\whatsapp-web-auth" 2>nul
echo Cleared.
echo Now double-click START.bat once and scan QR.
pause
