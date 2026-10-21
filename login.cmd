@echo off
cd /d "%~dp0"
echo Signing in to Vercel: a browser page will open; approve it there.
npx --yes vercel login
echo.
echo Done. You can close this window.
pause
