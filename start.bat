@echo off
color 0A
echo.
echo ========================================
echo    MPC - Mass Page Creator
echo    Quick Start Guide
echo ========================================
echo.
echo Choose an option:
echo.
echo [1] Start API Server (Port 4000)
echo [2] Start Web Server (Port 3000)
echo [3] Stop All Services
echo [4] Restart API Server
echo [5] Restart Web Server (Clean)
echo [6] Check Service Status
echo [7] Fix All Issues
echo [8] Run Fresh User Setup
echo [9] Create Test Project
echo [0] Exit
echo.
set /p choice="Enter your choice (0-9): "

if "%choice%"=="1" goto start_api
if "%choice%"=="2" goto start_web
if "%choice%"=="3" goto stop_all
if "%choice%"=="4" goto restart_api
if "%choice%"=="5" goto restart_web
if "%choice%"=="6" goto check_status
if "%choice%"=="7" goto fix_all
if "%choice%"=="8" goto fresh_user
if "%choice%"=="9" goto test_project
if "%choice%"=="0" goto end

:start_api
echo.
echo Starting API Server...
call restart-api.bat
goto end

:start_web
echo.
echo Starting Web Server...
cd apps\web
npm run dev
goto end

:stop_all
echo.
call stop-all.bat
goto menu

:restart_api
echo.
call restart-api.bat
goto end

:restart_web
echo.
call restart-web.bat
goto end

:fix_all
echo.
call fix-all.bat
goto menu

:check_status
echo.
echo ========================================
echo    Service Status
echo ========================================
echo.

echo [API Server - Port 4000]
netstat -ano | findstr :4000 | findstr LISTENING > nul
if %errorlevel% equ 0 (
    echo Status: RUNNING
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4000 ^| findstr LISTENING') do (
        echo PID: %%a
    )
) else (
    echo Status: NOT RUNNING
)
echo.

echo [Web Server - Port 3000]
netstat -ano | findstr :3000 | findstr LISTENING > nul
if %errorlevel% equ 0 (
    echo Status: RUNNING
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
        echo PID: %%a
    )
) else (
    echo Status: NOT RUNNING
)
echo.

echo [MongoDB - Port 27017]
netstat -ano | findstr :27017 | findstr LISTENING > nul
if %errorlevel% equ 0 (
    echo Status: RUNNING
) else (
    echo Status: NOT RUNNING
    echo WARNING: MongoDB is required!
)
echo.

echo [Redis - Port 6379]
netstat -ano | findstr :6379 | findstr LISTENING > nul
if %errorlevel% equ 0 (
    echo Status: RUNNING
) else (
    echo Status: NOT RUNNING
    echo WARNING: Redis is required for queue!
)
echo.

echo ========================================
pause
goto menu

:fresh_user
echo.
echo Running Fresh User Setup...
node fresh-user-setup.js
pause
goto menu

:test_project
echo.
echo Creating Test Project...
node create-test-project.js
pause
goto menu

:menu
cls
goto :eof

:end
echo.
echo Exiting...
exit
