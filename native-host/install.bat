@echo off
REM ContextPrompt AI — Native Messaging Host Installer (Windows)
REM Run this script as Administrator to register the native host.

set HOST_NAME=com.contextprompt.ai
set SCRIPT_DIR=%~dp0
set MANIFEST_PATH=%SCRIPT_DIR%manifest.json

REM Update manifest path to absolute
echo Registering Native Messaging Host: %HOST_NAME%
echo Manifest: %MANIFEST_PATH%

REM Write registry key
REG ADD "HKCU\Software\Google\Chrome\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Native Messaging Host registered successfully.
    echo Host: %HOST_NAME%
    echo Manifest: %MANIFEST_PATH%
) else (
    echo.
    echo ERROR: Failed to register Native Messaging Host.
    echo Please run this script as Administrator.
)

pause
