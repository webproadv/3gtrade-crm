@echo off
rem Avvia 3Gtrade CRM con Docker Desktop e apre il browser.
cd /d "%~dp0"
title 3Gtrade CRM
echo.
echo  Avvio di 3Gtrade CRM...
echo.
docker info >nul 2>&1
if errorlevel 1 (
  echo  Docker Desktop non risulta avviato.
  echo  Aprilo dal menu Start, attendi che sia pronto e riprova.
  echo.
  pause
  exit /b 1
)
docker compose up -d --build
if errorlevel 1 (
  echo.
  echo  Qualcosa e' andato storto: copia il testo qui sopra e invialo a chi ti assiste.
  pause
  exit /b 1
)
echo.
echo  Attendo che il CRM sia pronto (la prima volta puo' richiedere qualche minuto)...
set /a tentativi=0
:attesa
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://localhost:8080/api/health; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto pronto
set /a tentativi+=1
if %tentativi% geq 100 (
  echo  Il CRM non risponde. Prova "docker compose logs app" oppure riavvia il computer e riprova.
  pause
  exit /b 1
)
timeout /t 3 /nobreak >nul
goto attesa
:pronto
echo.
echo  Pronto! Apro http://localhost:8080
start "" http://localhost:8080
timeout /t 5 >nul
