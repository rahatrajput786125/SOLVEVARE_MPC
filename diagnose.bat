@echo off
color 0B
echo.
echo ========================================
echo    MPC System Diagnostics
echo ========================================
echo.

REM Check MongoDB
echo [1/5] Checking MongoDB...
netstat -ano | findstr :27017 | findstr LISTENING > nul
if %errorlevel% equ 0 (
    echo ✅ MongoDB is RUNNING
) else (
    echo ❌ MongoDB is NOT RUNNING
    echo    Solution: Start MongoDB service
    echo    Command: net start MongoDB
)
echo.

REM Check Redis
echo [2/5] Checking Redis...
netstat -ano | findstr :6379 | findstr LISTENING > nul
if %errorlevel% equ 0 (
    echo ✅ Redis is RUNNING
) else (
    echo ⚠️  Redis is NOT RUNNING
    echo    Note: Redis is optional but recommended for queue
)
echo.

REM Check API
echo [3/5] Checking API Server...
netstat -ano | findstr :4000 | findstr LISTENING > nul
if %errorlevel% equ 0 (
    echo ✅ API Server is RUNNING on port 4000
    
    REM Test API health
    curl -s http://localhost:4000/api/v1/health > nul 2>&1
    if %errorlevel% equ 0 (
        echo ✅ API is responding to requests
    ) else (
        echo ⚠️  API is running but not responding
        echo    Solution: restart-api.bat
    )
) else (
    echo ❌ API Server is NOT RUNNING
    echo    Solution: restart-api.bat
)
echo.

REM Check Web
echo [4/5] Checking Web Server...
netstat -ano | findstr :3000 | findstr LISTENING > nul
if %errorlevel% equ 0 (
    echo ✅ Web Server is RUNNING on port 3000
) else (
    echo ❌ Web Server is NOT RUNNING
    echo    Solution: restart-web.bat
)
echo.

REM Test Login
echo [5/5] Testing Login Endpoint...
node test-login.js
echo.

echo ========================================
echo    Diagnostic Complete
echo ========================================
echo.
pause
