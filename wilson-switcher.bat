@echo off
setlocal
cd /d "%~dp0"
node src\server\switcherCli.js --interactive %*
set EXIT_CODE=%ERRORLEVEL%
if %EXIT_CODE% NEQ 0 (
  echo.
  echo [WilsonGeoGuard] El proceso finalizo con codigo %EXIT_CODE%.
  pause
)
endlocal & exit /b %EXIT_CODE%
