@echo off
rem Ferma 3Gtrade CRM. I dati restano salvati.
cd /d "%~dp0"
docker compose stop
echo.
echo  3Gtrade CRM fermato. I dati sono salvati e li ritrovi al prossimo avvio.
timeout /t 5 >nul
