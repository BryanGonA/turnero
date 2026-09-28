#!/usr/bin/env bash
# verify.sh — Suite de humo post-instalación del Turnero.
#
# Verifica por HTTP (sin navegador) que todo el sistema está vivo:
#   backend, base seedada, login, voz (campanita + anuncio piper),
#   frontend, kiosco y pantalla de sala.
#
# Uso:  ./verify.sh     (desde turnero/)
set -uo pipefail
cd "$(dirname "$0")"

API="http://localhost:3001"
WEB="http://localhost:8080"
PASS=0; FAIL=0

ok()   { PASS=$((PASS+1)); echo "  PASS — $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL — $1"; }

echo "=== Verificación del Turnero ==="

# 1) Backend arriba
if curl -sf -o /dev/null "$API/api/areas"; then ok "backend responde en :3001"
else bad "backend NO responde en :3001"; fi

# 2) Módulos seedeados (3 áreas)
AREAS=$(curl -s "$API/api/areas" 2>/dev/null | grep -o '"id_prefix"' | wc -l)
[ "$AREAS" -ge 3 ] && ok "módulos seedeados ($AREAS áreas)" || bad "esperaba 3 áreas, hay $AREAS"

# 3) Frontend arriba (kiosco)
if curl -sf -o /dev/null "$WEB/"; then ok "frontend/kiosco en :8080"
else bad "frontend NO responde en :8080"; fi

# 4) Pantalla de sala arriba
if curl -sf -o /dev/null "$WEB/screen"; then ok "pantalla de sala en :8080/screen"
else bad "pantalla de sala NO responde"; fi

# 5) Login del admin
TOKEN=$(curl -s -X POST "$API/api/login" -H 'Content-Type: application/json' \
  -d '{"id_number":"admin","password":"adminpassword"}' 2>/dev/null \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -n "$TOKEN" ]; then ok "login admin (seed inicial funciona)"
else bad "login admin falló — ¿seed corrió? (revisar: podman logs turnero_backend_1)"; fi

if [ -n "$TOKEN" ]; then
  # 6) Usuarios seedeados (≥4: admin + 3 asesores)
  USERS=$(curl -s "$API/api/users" -H "Authorization: Bearer $TOKEN" 2>/dev/null | grep -o '"role"' | wc -l)
  [ "$USERS" -ge 4 ] && ok "usuarios seedeados ($USERS)" || bad "esperaba ≥4 usuarios, hay $USERS"

  # 7) Campanita de la pantalla (WAV RIFF generado por ffmpeg)
  curl -s "$API/api/audio/ding" -o /tmp/verify-ding.wav 2>/dev/null
  if [ "$(head -c 4 /tmp/verify-ding.wav 2>/dev/null)" = "RIFF" ]; then ok "campanita generada (audio/ding RIFF)"
  else bad "campanita inválida — voz de pantalla comprometida"; fi

  # 8) Anuncio de voz (piper): ticket de prueba + limpieza con transición válida
  TKID=$(curl -s -X POST "$API/api/tickets" -H 'Content-Type: application/json' \
    -d '{"area_id":6,"requester_id_number":"999999001"}' 2>/dev/null \
    | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
  if [ -n "$TKID" ]; then
    curl -s "$API/api/audio/announce/$TKID" -o /tmp/verify-ann.wav 2>/dev/null
    if [ "$(head -c 4 /tmp/verify-ann.wav 2>/dev/null)" = "RIFF" ]; then
      SIZE=$(stat -c%s /tmp/verify-ann.wav 2>/dev/null || echo 0)
      ok "anuncio de voz generado (piper, ${SIZE}B)"
    else bad "anuncio de voz inválido"; fi
    # limpieza: WAITING→UNSERVED es la transición válida (DONE daría 409)
    curl -s -o /dev/null -X PUT "$API/api/tickets/$TKID" \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      -d '{"status":"UNSERVED"}'
  else bad "no se pudo crear ticket de prueba"; fi
fi

echo ""
echo "=== Resultado: $PASS PASS / $FAIL FAIL ==="
[ "$FAIL" -eq 0 ] && echo "SISTEMA VERDE ✓" || { echo "SISTEMA CON FALLAS — revisar los puntos marcados"; exit 1; }
