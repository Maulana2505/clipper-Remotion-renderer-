@echo off
setlocal
cd /d "%~dp0"

echo Restarting Clipper...
call "%~dp0stop-clipper.bat"
ping -n 3 127.0.0.1 >nul
call "%~dp0start-clipper.bat"

endlocal
