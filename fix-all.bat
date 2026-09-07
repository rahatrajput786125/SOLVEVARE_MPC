@echo off
color 0E
echo.
echo ========================================
echo    MPC - Complete System Fix
echo ========================================
echo.
echo This will:
echo  - Stop all services
echo  - Clear all caches
echo  - Fix port issues
echo  - Restart services
echo.
pause
echo.

REM ============================================
REM Step 1: Stop All Services
REM ============================================
echo [Step 1/5] Stopping all services...
echo.

echo Stopping Web Server (Port 3000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo Stopping API Server (Port 4000)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4000 ^| findstr LISTENING 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo All services stopped.
timeout /t 3 /nobreak >nul

REM ============================================
REM Step 2: Clear Web Cache
REM ============================================
echo.
echo [Step 2/5] Clearing Web cache...
cd apps\web
if exist .next (
    rmdir /s /q .next
    echo Web cache cleared.
) else (
    echo No web cache found.
)
if exist node_modules\.cache (
    rmdir /s /q node_modules\.cache
    echo Node cache cleared.
)
cd ..\..

REM ============================================
REM Step 3: Clear API Cache
REM ============================================
echo.
echo [Step 3/5] Clearing API cache...
cd apps\api
if exist dist (
    rmdir /s /q dist
    echo API dist cleared.
)
if exist node_modules\.cache (
    rmdir /s /q node_modules\.cache
    echo API cache cleared.
)
cd ..\..

REM ============================================
REM Step 4: Verify Ports are Free
REM ============================================
echo.
echo [Step 4/5] Verifying ports are free...
timeout /t 2 /nobreak >nul

netstat -ano | findstr :3000 | findstr LISTENING > nul
if %errorlevel% equ 0 (
    echo WARNING: Port 3000 still in use!
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
        taskkill /F /PID %%a >nul 2>&1
    )
    timeout /t 2 /nobreak >nul
)

netstat -ano | findstr :4000 | findstr LISTENING > nul
if %errorlevel% equ 0 (
    echo WARNING: Port 4000 still in use!
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4000 ^| findstr LISTENING') do (
        taskkill /F /PID %%a >nul 2>&1
    )
    timeout /t 2 /nobreak >nul
)

echo Ports are now free.

REM ============================================
REM Step 5: Show Next Steps
REM ============================================
echo.
echo [Step 5/5] System is ready!
echo.
echo ========================================
echo    Fix Complete!
echo ========================================
echo.
echo Next Steps:
echo.
echo 1. Start API Server:
echo    restart-api.bat
echo.
echo 2. Start Web Server:
echo    restart-web.bat
echo.
echo 3. Or use interactive menu:
echo    start.bat
echo.
echo ========================================
pause
