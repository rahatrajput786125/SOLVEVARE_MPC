@echo off
echo ========================================
echo    Stopping All MPC Services
echo ========================================
echo.

echo Checking running services...
echo.

REM Check port 3000 (Web)
echo [Web Server - Port 3000]
netstat -ano | findstr :3000 | findstr LISTENING > nul
if %errorlevel% equ 0 (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
        echo Stopping Web Server (PID: %%a)...
        taskkill /F /PID %%a >nul 2>&1
    )
    echo Web Server stopped.
) else (
    echo Web Server not running.
)
echo.

REM Check port 4000 (API)
echo [API Server - Port 4000]
netstat -ano | findstr :4000 | findstr LISTENING > nul
if %errorlevel% equ 0 (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4000 ^| findstr LISTENING') do (
        echo Stopping API Server (PID: %%a)...
        taskkill /F /PID %%a >nul 2>&1
    )
    echo API Server stopped.
) else (
    echo API Server not running.
)
echo.

echo ========================================
echo    All Services Stopped
echo ========================================
echo.
echo To start services:
echo   - API:  restart-api.bat
echo   - Web:  cd apps\web ^&^& npm run dev
echo.
pause
