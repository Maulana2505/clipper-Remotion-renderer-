@echo off
setlocal
cd /d "%~dp0"

echo Stopping Clipper...

powershell -NoProfile -ExecutionPolicy Bypass -Command "$killed = 0; Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('python.exe','node.exe') -and $_.CommandLine -and ($_.CommandLine -match 'uvicorn app\.main:app|next[\\/]dist[\\/]bin[\\/]next|start-server\.js|next-server|\.next[\\/]dev[\\/]') } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; $killed++ } catch {} }; foreach ($port in 8000,3000) { Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $proc = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $_.OwningProcess); if ($proc -and $proc.CommandLine -match 'Clipper|uvicorn|next') { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue; $killed++ } } }; Write-Host ('Stopped ' + $killed + ' process(es).')"

ping -n 3 127.0.0.1 >nul

netstat -ano | findstr /R /C:":8000 .*LISTENING" /C:":3000 .*LISTENING" >nul
if not errorlevel 1 (
  echo.
  echo [WARN] Port 8000 or 3000 is still in use by another application.
) else (
  echo.
  echo Clipper stopped. Ports 8000 and 3000 are free.
)

endlocal
