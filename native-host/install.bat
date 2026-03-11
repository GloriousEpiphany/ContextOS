@echo off
REM ContextPrompt AI — Native Messaging Host Installer (Windows)
REM Registers the native host so Chrome can launch it.

set HOST_NAME=com.contextprompt.ai
set SCRIPT_DIR=%~dp0
REM Remove trailing backslash for clean paths
if "%SCRIPT_DIR:~-1%"=="\" set SCRIPT_DIR=%SCRIPT_DIR:~0,-1%

set RUNNER=%SCRIPT_DIR%\run.bat
set MANIFEST_OUT=%SCRIPT_DIR%\manifest.json

REM ── Get Extension ID ──
echo.
echo To find your Extension ID:
echo   1. Open chrome://extensions
echo   2. Enable Developer Mode
echo   3. Find "ContextPrompt AI" and copy the ID
echo.
set /p EXT_ID="Enter your Chrome Extension ID: "

if "%EXT_ID%"=="" (
    echo ERROR: Extension ID is required.
    pause
    exit /b 1
)

REM ── Create runner script ──
echo @echo off> "%RUNNER%"
echo node "%SCRIPT_DIR%\index.js" %%*>> "%RUNNER%"

REM ── Generate manifest with absolute path to runner ──
set RUNNER_JSON=%RUNNER:\=\\%

(
echo {
echo   "name": "%HOST_NAME%",
echo   "description": "ContextPrompt AI Native Messaging Host for MCP protocol bridge",
echo   "path": "%RUNNER_JSON%",
echo   "type": "stdio",
echo   "allowed_origins": [
echo     "chrome-extension://%EXT_ID%/"
echo   ]
echo }
) > "%MANIFEST_OUT%"

REM ── Register in Windows Registry ──
echo.
echo Registering Native Messaging Host: %HOST_NAME%
REG ADD "HKCU\Software\Google\Chrome\NativeMessagingHosts\%HOST_NAME%" /ve /t REG_SZ /d "%MANIFEST_OUT%" /f

if %ERRORLEVEL% EQU 0 (
    echo.
    echo Native Messaging Host registered successfully.
    echo   Host:       %HOST_NAME%
    echo   Manifest:   %MANIFEST_OUT%
    echo   Runner:     %RUNNER%
    echo   Extension:  %EXT_ID%
    echo.
    echo Make sure "node" is in your PATH.
    echo Enable "MCP Server" in the extension settings to start using it.
) else (
    echo.
    echo ERROR: Failed to register. Try running as Administrator.
)

pause
