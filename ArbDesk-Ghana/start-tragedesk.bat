@echo off
title TrageDesk Ghana
cd /d "%~dp0"
echo Starting TrageDesk Ghana Arbitrage Bot...
start http://localhost:3000
node src/index.js
pause
