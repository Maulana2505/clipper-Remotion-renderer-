@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   Clipper - start API + web
echo ============================================
echo.

if not exist "apps\api\.venv\Scripts\python.exe" (
  echo [ERROR] Backend virtualenv not found.
  echo Expected: apps\api\.venv\Scripts\python.exe
  echo Follow the setup steps in README.md first.
  echo.
  pause
  exit /b 1
)

if not exist "apps\web\node_modules" (
  echo [ERROR] Frontend dependencies not installed.
  echo Run: cd apps\web ^&^& npm install
  echo.
  pause
  exit /b 1
)

netstat -ano | findstr /R /C:":8000 .*LISTENING" /C:":3000 .*LISTENING" >nul
if not errorlevel 1 (
  echo [WARN] Port 8000 or 3000 is already in use.
  echo Run stop-clipper.bat first, then try again.
  echo.
  pause
  exit /b 1
)

echo Starting API on http://127.0.0.1:8000 ...
start "Clipper API" /D "apps\api" cmd /k ".\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

echo Starting web app on http://localhost:3000 ...
start "Clipper Web" /D "apps\web" cmd /k "npm run dev"

echo.
echo Waiting for services...

powershell -NoProfile -ExecutionPolicy Bypass -Command "function Wait-Url($u) { for ($i = 0; $i -lt 80; $i++) { try { $r = Invoke-WebRequest -UseBasicParsing $u -TimeoutSec 2; if ($r.StatusCode -eq 200) { return $true } } catch {}; Start-Sleep -Milliseconds 500 }; return $false }; $api = Wait-Url 'http://127.0.0.1:8000/api/health'; $web = Wait-Url 'http://localhost:3000'; if ($api -and $web) { exit 0 } elseif ($web) { exit 2 } else { exit 1 }"

if errorlevel 2 (
  echo.
  echo [WARN] Web is up but the API did not respond.
  echo Check the "Clipper API" window for errors.
  start "" http://localhost:3000
  endlocal
  exit /b 0
)

if errorlevel 1 (
  echo.
  echo [WARN] Services did not respond in time.
  echo Check the "Clipper API" and "Clipper Web" windows.
  echo.
  pause
  endlocal
  exit /b 1
)

echo.
echo Clipper is running: http://localhost:3000
echo Close the two windows or run stop-clipper.bat to stop.
start "" http://localhost:3000
endlocal
