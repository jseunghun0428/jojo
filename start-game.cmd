@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. See README.md for setup.
  pause
  exit /b 1
)
if not exist "node_modules\.bin\vite.cmd" (
  call npm.cmd ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm.cmd run dev -- --open
if errorlevel 1 pause
