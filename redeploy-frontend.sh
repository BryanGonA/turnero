#!/usr/bin/env bash
# Redespliega el frontend del Turnero en :8080 (stack de pruebas, Podman).
#
# Por qué existe: el contenedor nginx sirve un build horneado dentro de la
# imagen. `podman-compose up -d --build` reconstruye la imagen PERO NO recrea
# el contenedor, así que :8080 sigue sirviendo el build viejo. Este script
# hace el ciclo completo y verifica que :8080 sirva exactamente el dist nuevo.
#
# Uso:  ./redeploy-frontend.sh          (desde turnero/)
#       bash redeploy-frontend.sh

set -euo pipefail
cd "$(dirname "$0")"

FRONTEND_DIR="frontend"
CONTAINER="turnero_frontend_1"
URL="http://localhost:8080"

echo "==> 1/4 Build de Vite (dist/)"
(cd "$FRONTEND_DIR" && npm run build)

echo "==> 2/4 Rebuild de la imagen (capa npm ci cacheada: rápido)"
podman-compose build frontend

echo "==> 3/4 Recreación forzada del contenedor"
# up -d solo NO recrea el contenedor existente: hay que removerlo primero.
podman stop "$CONTAINER" 2>/dev/null || true
podman rm   "$CONTAINER" 2>/dev/null || true
podman-compose up -d frontend

echo "==> 4/4 Verificación: :8080 debe servir el dist nuevo"
sleep 3

DIST_BUNDLE=$(ls "$FRONTEND_DIR/dist/assets/" | grep '^index-' | grep '\.js$' | head -1)
if [ -z "$DIST_BUNDLE" ]; then
  echo "✗ No encontré el bundle JS en $FRONTEND_DIR/dist/assets/"
  exit 1
fi

SERVED_BUNDLE=$(curl -s "$URL/" | grep -o 'index-[A-Za-z0-9_-]*\.js' | head -1 || true)
if [ -z "$SERVED_BUNDLE" ]; then
  echo "✗ $URL no responde. ¿Está el contenedor arriba? (podman ps)"
  exit 1
fi

if [ "$SERVED_BUNDLE" = "$DIST_BUNDLE" ]; then
  echo "✓ :8080 sirve el build nuevo ($SERVED_BUNDLE)"
  echo "✓ Listo. Refrescá el navegador en $URL"
else
  echo "✗ Desajuste: :8080 sirve '$SERVED_BUNDLE' pero el dist local es '$DIST_BUNDLE'."
  echo "  El contenedor quedó con un build viejo: revisá 'podman logs $CONTAINER'."
  exit 1
fi
