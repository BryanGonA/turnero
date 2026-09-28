#!/usr/bin/env bash
# Lanzador de PANTALLA de sala del Turnero (Linux — la PC conectada al TV).
#
# No instala nada: solo abre el navegador en modo kiosco con los flags
# correctos (autoplay habilitado para que la campanita y la voz suenen
# desde el primer turno, sin necesitar interacción).
#
# Uso:
#   ./kiosk.sh                    → apunta a http://localhost:8080/screen
#   ./kiosk.sh 192.168.1.50       → apunta al servidor en esa IP
#   KIOSK_URL=http://mi.server:8080/screen ./kiosk.sh
set -euo pipefail

SERVER="${1:-localhost}"
URL="${KIOSK_URL:-http://${SERVER}:8080/screen}"
FLAGS="--kiosk --autoplay-policy=no-user-gesture-required --noerrdialogs --disable-infobars --disable-session-crashed-bubble --no-first-run"

# Buscar un navegador disponible
BROWSER=""
for b in chromium-browser chromium google-chrome google-chrome-stable firefox; do
  command -v "$b" >/dev/null 2>&1 && { BROWSER="$b"; break; }
done

if [ -z "$BROWSER" ]; then
  echo "ERROR: no encontré Chromium ni Chrome ni Firefox."
  echo "Instalá Chromium y volvé a correr este script:"
  echo "  Debian/Ubuntu:  sudo apt install chromium"
  echo "  Fedora:         sudo dnf install chromium-browser"
  exit 1
fi

echo "Abriendo $BROWSER en modo kiosco → $URL"
exec "$BROWSER" $FLAGS "$URL"
