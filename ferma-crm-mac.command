#!/bin/bash
# Ferma 3Gtrade CRM. I dati restano salvati.
cd "$(dirname "$0")" || exit 1
docker compose stop
echo
echo " 3Gtrade CRM fermato. I dati sono salvati e li ritrovi al prossimo avvio."
