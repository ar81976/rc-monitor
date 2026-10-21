@echo off
cd /d "%~dp0"
node stamp.cjs
npx --yes vercel --prod --yes
echo.
echo Finished. You can close this window.
pause
