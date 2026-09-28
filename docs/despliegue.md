# Despliegue local de pruebas (Podman)

Stack: **PostgreSQL 16** + **backend Node/Express** + **frontend Nginx (build de Vite)**.
Base de datos: PostgreSQL (migrado desde MySQL el 2026-09-23; no había datos que preservar).

## Archivos

| Archivo | Rol |
|---|---|
| `docker-compose.yml` | Orquesta `db`, `backend`, `frontend` |
| `backend/Dockerfile` | node:20-bookworm-slim + openssl + ffmpeg + espeak-ng + **piper-tts** (voz neural es_MX) + `db push` + seed + start |
| `frontend/Dockerfile` | build de Vite → Nginx sirviendo `dist` |

## Comandos

```bash
cd turnero
podman-compose up -d --build       # levantar / reconstruir
podman logs turnero_backend_1 -f   # ver backend
podman-compose down                # detener (conserva datos)
podman-compose down -v             # detener y BORRAR la base de datos
```

- Frontend: http://localhost:8080
- Backend/API: http://localhost:3001
- Admin inicial (seed): `admin` / `adminpassword` — cambiar tras el primer login.

## Notas

- El backend corre `prisma db push` al arrancar: el schema se sincroniza automático con un Postgres vacío. Válido en pruebas; en producción usar `prisma migrate` con carpeta de migraciones versionadas.
- Los videos subidos persisten en el volumen `turnero-uploads`; la BD en `turnero-pgdata`.
- Credenciales del compose (`turnero/turnero`, `JWT_SECRET`) son de laboratorio. Cambiarlas junto con la Fase 1 del plan.
- Para probar en la LAN desde otros equipos: no requiere cambios — el frontend conecta a `http://<host>:3001` dinámicamente. Basta exponer 8080 y 3001.
- `TZ=America/Bogota` ya está fijada en el contenedor del backend (anticipo parcial del hallazgo I7).

## Verificación rápida tras levantar

```bash
curl -s -X POST http://localhost:3001/api/login \
  -H 'Content-Type: application/json' \
  -d '{"id_number":"admin","password":"adminpassword"}'
```
Debe responder un JSON con `token`. Probado: login, creación de área, dos turnos correlativos (`C001`, `C002`), listado de cola, handshake de Socket.IO y frontend 200.
