@echo off
rem Asset Foundry for Windows: double-click this file to start the app.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get version 26 or newer from https://nodejs.org and run this again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo First run: installing... this takes a few minutes.
  call npm install || (pause & exit /b 1)
)
echo Starting Asset Foundry. Leave this window open; close it to stop the app.
call npm start
pause
