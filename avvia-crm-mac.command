#!/bin/bash
# Avvia 3Gtrade CRM con Docker Desktop e apre il browser.
cd "$(dirname "$0")" || exit 1
echo
echo " Avvio di 3Gtrade CRM..."
echo
if ! docker info >/dev/null 2>&1; then
  echo " Docker Desktop non risulta avviato."
  echo " Aprilo dalla cartella Applicazioni, attendi che sia pronto e riprova."
  read -r -p " Premi Invio per chiudere."
  exit 1
fi
if ! docker compose up -d --build; then
  echo
  echo " Qualcosa e' andato storto: copia il testo qui sopra e invialo a chi ti assiste."
  read -r -p " Premi Invio per chiudere."
  exit 1
fi
echo
echo " Attendo che il CRM sia pronto (la prima volta puo' richiedere qualche minuto)..."
for _ in $(seq 1 100); do
  if curl -fs http://localhost:8080/api/health >/dev/null 2>&1; then
    echo " Pronto! Apro http://localhost:8080"
    if command -v open >/dev/null; then open http://localhost:8080; else xdg-open http://localhost:8080 >/dev/null 2>&1 || true; fi
    exit 0
  fi
  sleep 3
done
echo " Il CRM non risponde. Prova: docker compose logs app"
read -r -p " Premi Invio per chiudere."
exit 1
