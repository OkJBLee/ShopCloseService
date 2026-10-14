@echo off
rem ShopCloseService local run (NK dev etc.) - requires Node.js
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. https://nodejs.org & pause & exit /b 1)
node local-server.js
pause
