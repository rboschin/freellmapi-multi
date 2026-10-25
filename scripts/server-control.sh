#!/usr/bin/env bash
#
# server-control.sh - Ferma e rilancia il server freellmapi-multi sulla porta 3001.
#
# USO:
#   ./scripts/server-control.sh
#   In background: nohup ./scripts/server-control.sh &
#
#   1. Individua il processo che occupa la porta 3001 (tramite lsof -ti :3001)
#   2. Lo termina con kill -9 (se nessun processo usa la porta, salta il kill)
#   3. Riavvia il server in modalità dev con `npm run dev -w server`
#      (tsx watch, porta letta da .env, default 3001)
#
# PREREQUISITI:
#   - Dipendenze installate: `npm install` (o scripts/dev-bootstrap.sh)
#   - File `.env` presente con `PORT=3001`
#
# FERMARE IL SERVER DOPO L'AVVIO:
#   Premi Ctrl+C nel terminale.
#
set -euo pipefail
PORT=3001
PID=$(lsof -ti :$PORT || true)
if [ -n "$PID" ]; then
  kill -9 $PID
fi
npm run dev -w server
