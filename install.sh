#!/usr/bin/env bash
# install.sh — Instalación del Turnero en UN comando (Linux).
#
# Qué hace:
#   1. Verifica prerequisitos (podman+compose o docker+compose)
#      — y si faltan, ofrece instalarlos con sudo según tu distro
#   2. Construye y levanta el stack completo (db, backend con voz piper, frontend)
#   3. Ejecuta la suite de verificación (verify.sh) y muestra el resumen
#
# Uso:
#   ./install.sh              (desde la carpeta turnero/)
#   bash install.sh
set -euo pipefail
cd "$(dirname "$0")"

# ---------------------------------------------------------------- 1) runtime
CONTAINER_CMD=""; COMPOSE_CMD=""
if command -v podman >/dev/null 2>&1 && command -v podman-compose >/dev/null 2>&1; then
  CONTAINER_CMD="podman"; COMPOSE_CMD="podman-compose"
elif command -v docker >/dev/null 2>&1; then
  CONTAINER_CMD="docker"
  if docker compose version >/dev/null 2>&1; then COMPOSE_CMD="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then COMPOSE_CMD="docker-compose"; fi
fi

if [ -z "$COMPOSE_CMD" ]; then
  echo "No encontré podman+podman-compose ni docker+docker-compose."
  # Sugerir el comando según la distro (y ofrecer instalar con sudo)
  if command -v apt-get >/dev/null 2>&1; then
    PKG="sudo apt-get install -y podman podman-compose"; DISTRO="Debian/Ubuntu"
  elif command -v dnf >/dev/null 2>&1; then
    PKG="sudo dnf install -y podman podman-compose"; DISTRO="Fedora"
  else
    PKG="(instalá podman + podman-compose manualmente)"; DISTRO="tu distro"
  fi
  echo "Comando para $DISTRO: $PKG"
  read -r -p "¿Lo ejecuto ahora con sudo? [s/N] " RESP
  if [ "$RESP" = "s" ] || [ "$RESP" = "S" ]; then
    sh -c "$PKG"
    exec "$0"   # re-ejecutar con el runtime ya presente
  fi
  exit 1
fi
echo "Runtime: $CONTAINER_CMD ($COMPOSE_CMD)"

# ---------------------------------------------------------------- 2) stack
echo ""
echo "==> Construyendo y levantando el stack..."
echo "    (primera vez: varios minutos — descarga la voz neural piper y la"
echo "     hornea en la imagen del backend)"
$COMPOSE_CMD up -d --build

echo ""
echo "==> Esperando el backend (máx 60s)..."
for i in $(seq 1 30); do
  if curl -sf -o /dev/null "http://localhost:3001/api/areas"; then break; fi
  [ "$i" -eq 30 ] && { echo "ERROR: el backend no arrancó. Logs: $COMPOSE_CMD logs backend"; exit 1; }
  sleep 2
done

# ---------------------------------------------------------------- 3) verificar
echo ""
bash ./verify.sh || {
  echo ""
  echo "La verificación encontró fallas. Logs útiles:"
  echo "  $COMPOSE_CMD logs backend | tail -30"
  echo "  $COMPOSE_CMD logs db | tail -30"
  exit 1
}

# ---------------------------------------------------------------- 4) resumen
cat <<'RESUMEN'

=== INSTALACIÓN COMPLETA ===

  Kiosco de turnos:     http://localhost:8080/
  Pantalla de sala:     http://localhost:8080/screen    (lanzar: ./kiosk.sh)
  Panel admin:          http://localhost:8080/admin   (admin / adminpassword)
  Asesores:             asesor1 / asesor2 / asesor3    (asesor12345)

  Credenciales completas:   docs/credenciales.md
  Respaldo de la BD:        ./backup.sh   (rotación de 14)

  En pantallas de la sala, siempre lanzar con:
      ./kiosk.sh [ip-del-servidor]
  (incluye el flag de autoplay: campanita y voz suenan desde el arranque)

RESUMEN
