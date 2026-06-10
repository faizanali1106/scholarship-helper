@echo off
cd /d "%~dp0"
title Scholarship Helper
echo.
echo   Starting Scholarship Helper...
echo   Keep this window open while applying.
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js is not installed. Download from https://nodejs.org
  pause
  exit /b 1
)
node launch.js
pause
