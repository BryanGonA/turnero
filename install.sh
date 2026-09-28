#!/usr/bin/env bash
# Instalador del Turnero para el SERVIDOR (Debian/Ubuntu/Fedora).
#
# Qué hace:
#   1. Detecta podman o docker (con sus respectivos compose)
#   2. Levanta el stack completo: base de datos, backend (con voz piper
#      horneada en la imagen) y frontend nginx
#   3. Verifica que el backend responda y crea el admin inicial
#
# Uso:
#   ./install.sh              (desde la carpeta turnero/)
#   bash install.sh
set -euo pipefail
cd "$(dirname "$0")"

SERVER_URL="http://localhost:8080"
API_URL="http://localhost:3001"

echo "=== Instalador del Turnero — Consultorio Jurídico ==="

# ---------------------------------------------------------------- runtime
CONTAINER_CMD=""
COMPOSE_CMD=""
if command -v podman >/dev/null 2>&1 && command -v podman-compose >/dev/null 2>&1; then
  CONTAINER_CMD="podman"; COMPOSE_CMD="podman-compose"
elif command -v docker >/dev/null 2>&1; then
  CONTAINER_CMD="docker"
  if docker compose version >/dev/null 2>&1; then COMPOSE_CMD="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then COMPOSE_CMD="docker-compose"
  fi
fi

if [ -z "$COMPOSE_CMD" ]; then
  echo "ERROR: no encontré podman+podman-compose ni docker+docker-compose."
  echo "Instalá uno de los dos y volvé a correr este script:"
  echo "  Debian/Ubuntu:  sudo apt install podman podman-compose"
  echo "                  (o) curl -fsSL https://get.docker.com | sh"
  exit 1
fi
echo "Runtime detectado: $CONTAINER_CMD ($COMPOSE_CMD)"

# ---------------------------------------------------------------- build & up
echo ""
echo "==> Construyendo imágenes (la primera vez tarda varios minutos:"
echo "    la voz neural piper se descarga y se hornea en el backend)..."
$COMPOSE_CMD up -d --build

echo ""
echo "==> Esperando el backend (máx 60s)..."
for i in $(seq 1 30); do
  if curl -sf -o /dev/null "$API_URL/api/areas"; then
    echo "    backend OK"
    break
  fi
  [ "$i" -eq 30 ] && { echo "ERROR: el backend no respondió. Revisá: $COMPOSE_CMD logs backend"; exit 1; }
  sleep 2
done

# ---------------------------------------------------------------- resumen
FRONT_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "$SERVER_URL/" || echo "sin respuesta")
echo ""
echo "=== Instalación completa ==="
echo ""
echo "  Kiosco de turnos:    $SERVER_URL/"
echo "  Pantalla de sala:    $SERVER_URL/screen"
echo "  Panel admin:         $SERVER_URL/admin     (admin / adminpassword)"
echo "  API del backend:     $API_URL"
echo ""
echo "  Voz de los anuncios: neural es_ES (piper) generada EN ESTE SERVIDER."
echo "  Las pantallas solo necesitan un navegador — no instalan nada."
echo "  Lanzá cada pantalla con:  ./kiosk.sh   (o kiosk.bat en Windows)"
echo ""
[ "$FRONT_STATUS" = "200" ] || echo "  ATENCIÓN: el frontend no respondió aún ($FRONT_STATUS) — revisá $COMPOSE_CMD logs frontend"
