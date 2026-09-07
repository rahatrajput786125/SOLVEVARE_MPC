@echo off
echo ========================================
echo    Restarting API Server
echo ========================================
echo.

echo [1/3] Checking port 4000...
netstat -ano | findstr :4000 > nul
if %errorlevel% equ 0 (
    echo Port 4000 is in use. Killing process...
    
    REM Get PID using port 4000
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4000 ^| findstr LISTENING') do (
        echo Killing process %%a...
        taskkill /F /PID %%a >nul 2>&1
    )
    
    echo Process killed successfully!
    timeout /t 2 /nobreak >nul
) else (
    echo Port 4000 is free.
)

echo.
echo [2/3] Verifying port is free...
netstat -ano | findstr :4000 > nul
if %errorlevel% equ 0 (
    echo WARNING: Port still in use. Trying again...
    timeout /t 2 /nobreak >nul
    
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4000 ^| findstr LISTENING') do (
        taskkill /F /PID %%a >nul 2>&1
    )
    timeout /t 2 /nobreak >nul
)

echo Port 4000 is now free!

echo.
echo [3/3] Starting API server...
echo.
echo ========================================
echo    API Server Starting...
echo    URL: http://localhost:4000/api/v1
echo    Docs: http://localhost:4000/api/docs
echo ========================================
echo.

cd apps\api
npm run dev
