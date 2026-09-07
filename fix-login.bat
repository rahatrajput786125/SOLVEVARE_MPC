@echo off
color 0C
echo.
echo ========================================
echo    Fix Login Issue
echo ========================================
echo.
echo This will:
echo  1. Stop API server
echo  2. Clear API cache
echo  3. Reset test user
echo  4. Restart API server
echo  5. Test login
echo.
pause
echo.

REM Step 1: Stop API
echo [1/5] Stopping API server...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4000 ^| findstr LISTENING 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo API stopped.
timeout /t 2 /nobreak >nul

REM Step 2: Clear cache
echo.
echo [2/5] Clearing API cache...
cd apps\api
if exist dist (
    rmdir /s /q dist
)
cd ..\..
echo Cache cleared.

REM Step 3: Reset user
echo.
echo [3/5] Resetting test user...
node fresh-user-setup.js
if %errorlevel% neq 0 (
    echo.
    echo ⚠️  User setup failed. Continuing anyway...
    timeout /t 2 /nobreak >nul
)

REM Step 4: Start API
echo.
echo [4/5] Starting API server...
echo Please wait 10 seconds for API to start...
start /min cmd /c "cd apps\api && npm run dev"
timeout /t 10 /nobreak >nul

REM Step 5: Test login
echo.
echo [5/5] Testing login...
node test-login.js

echo.
echo ========================================
echo    Fix Complete
echo ========================================
echo.
echo If login still fails:
echo  1. Check MongoDB is running
echo  2. Check API logs for errors
echo  3. Try: diagnose.bat
echo.
pause
