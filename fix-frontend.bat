@echo off
color 0E
echo.
echo ========================================
echo    Fixing Frontend Dependencies
echo ========================================
echo.

cd apps\web

echo [1/4] Stopping any running Next.js server...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq *next dev*" 2>nul

echo [2/4] Cleaning node_modules and .next...
if exist node_modules (
    rmdir /s /q node_modules
    echo    - node_modules deleted
)
if exist .next (
    rmdir /s /q .next
    echo    - .next deleted
)

echo [3/4] Cleaning package-lock...
if exist package-lock.json (
    del package-lock.json
    echo    - package-lock.json deleted
)

echo [4/4] Reinstalling dependencies...
call npm install

echo.
echo ========================================
echo    Fix Complete!
echo ========================================
echo.
echo Now run: npm run dev
echo.
pause
