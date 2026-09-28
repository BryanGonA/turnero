# Backend del Turnero — Debian slim (glibc requerido por piper)
FROM docker.io/library/node:20-bookworm-slim

# - openssl: engines de Prisma
# - ffmpeg: compresión de videos + campanita de la pantalla
# - espeak-ng: voz de respaldo si piper falla
# - python3/pip + piper-tts: voz NEURAL natural (OHF-Voice/piper1-gpl)
#   RAM pico medida: ~236MB por síntesis (cacheada: una vez por anuncio).
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends \
      openssl ffmpeg espeak-ng python3 python3-pip \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m pip install --break-system-packages --no-cache-dir --quiet piper-tts

WORKDIR /app

# Voz neural en español LATAM (claude, es_MX, calidad HIGH — neutro
# institucional) horneada en la imagen: las pantallas no instalan nada.
# Alternativa es_AR-daniela-high (argentina): un string + rebuild.
RUN python3 -m piper.download_voices es_MX-claude-high
ENV PIPER_VOICE=/app/es_MX-claude-high.onnx

COPY package.json package-lock.json ./
# incluye devDependencies: se necesita tsx para el seed
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY index.js ./

EXPOSE 3001

# Sincroniza el schema (contexto de pruebas; para producción usar migraciones),
# crea el admin inicial si no existe y arranca.
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && npx prisma db seed && node index.js"]
