@echo off
echo ========================================
echo    Restarting Web Server (Clean)
echo ========================================
echo.

echo [1/4] Stopping Web Server (Port 3000)...
netstat -ano | findstr :3000 | findstr LISTENING > nul
if %errorlevel% equ 0 (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
        echo Killing process %%a...
        taskkill /F /PID %%a >nul 2>&1
    )
    echo Web Server stopped.
    timeout /t 2 /nobreak >nul
) else (
    echo Web Server not running.
)

echo.
echo [2/4] Clearing Next.js cache...
cd apps\web
if exist .next (
    echo Deleting .next directory...
    rmdir /s /q .next
    echo Cache cleared!
) else (
    echo No cache to clear.
)

echo.
echo [3/4] Clearing node_modules cache...
if exist node_modules\.cache (
    echo Deleting node_modules cache...
    rmdir /s /q node_modules\.cache
    echo Cache cleared!
)

echo.
echo [4/4] Starting Web Server...
echo.
echo ========================================
echo    Web Server Starting...
echo    URL: http://localhost:3000
echo    This may take 30-60 seconds...
echo ========================================
echo.

npm run dev
