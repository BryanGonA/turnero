# Guía del Proyecto — Turnero Consultorio Jurídico

Universidad Libre, Seccional Cali. Sistema de turnos con kiosco táctil, atención por asesores (principal/suplente), pantalla de sala con voz, administración, reportes y contenido audiovisual.

## Infraestructura

| Componente | Tecnología | Contenedor | Puerto |
|---|---|---|---|
| Base de datos | PostgreSQL 16 | `turnero_db_1` | 5432 |
| API + tiempo real | Node 20 · Express 5 · Prisma · Socket.IO | `turnero_backend_1` | 3001 |
| Frontend | React + Vite + Tailwind v4, servido por Nginx | `turnero_frontend_1` | **8080** |

Levantar: `cd turnero && podman-compose up -d --build`. Detener conservando datos: `podman-compose down`.
Credenciales iniciales: `admin` / `adminpassword` (cambiar en el primer ingreso).

## Rutas de la aplicación (frontend)

| URL | Pantalla | Acceso | Uso |
|---|---|---|---|
| `/` | Kiosco de turnos | Público | El ciudadano elige servicio, digita su cédula e imprime el turno |
| `/login` | Inicio de sesión | Público | Personal del consultorio |
| `/screen` | Pantalla de sala | Público | TV/monitor: turno llamado + voz + videos de la playlist |
| `/advisor` | Panel del asesor | ADVISOR, ADMIN | Llamar, rellamar, atender, finalizar y transferir turnos |
| `/admin` | Panel de administración | ADMIN | Cola del día, usuarios, áreas, videos, reportes, parámetros, logs |
| `/marketing` | Contenido de pantalla | MARKETING, ADMIN | Subir, ordenar y borrar videos de la sala |

Redirección tras login por rol: `ADVISOR → /advisor` · `ADMIN → /admin` · `MARKETING → /marketing`.

## Roles

| Rol | Puede |
|---|---|
| `ADMIN` | Todo: usuarios, áreas, parámetros, reportes, cancelar turnos, contenido |
| `ADVISOR` (perfil PRINCIPAL) | Atender la cola de su área y transferir a suplentes (triaje) |
| `ADVISOR` (perfil SUPLENTE) | Atender los turnos que le transfieren |
| `MARKETING` | Solo gestionar los videos de la pantalla de sala |
| `REQUESTER` | Rol reservado; el kiosco no requiere login |

## API (backend `:3001`)

### Públicos (kiosco y pantalla de sala)
| Método y ruta | Función |
|---|---|
| `POST /api/login` | Login (con rate-limit) → `{ token, user }` |
| `GET /api/areas` | Áreas públicas del kiosco |
| `POST /api/tickets` | Crear turno (numeración atómica por área/día) |
| `GET /api/tickets` | Cola de la jornada (`?status=&area_id=&advisor_profile=&advisor_id=`, `?all_dates=true` para histórico) |
| `GET /api/videos` | Playlist de la pantalla |
| `GET /health` | Estado del servicio y la BD |

### ADVISOR (`Authorization: Bearer <token>`)
| Ruta | Función |
|---|---|
| `PUT /api/tickets/:id` | Máquina de estados: `CALLING` (toma atómica, 409 si ya fue tomado), `SERVED`, `DONE` |
| `PUT /api/tickets/:id/assign` | Transferir a suplente (mismo ticket, sin clonar) |
| `GET /api/users/suplentes` | Lista ligera de suplentes |
| `POST /api/change-password` | Cambio de contraseña (exige la actual, mín. 8) |

### ADMIN (todo lo anterior +)
| Ruta | Función |
|---|---|
| `GET/POST/PUT/DELETE /api/users*` | Gestión de usuarios (sin exponer hashes) |
| `POST/PUT /api/areas*` | Gestión de áreas |
| `GET/POST /api/parameters` | Parámetros clave-valor |
| `POST/DELETE /api/videos`, `PUT /api/videos/reorder` | Contenido (también MARKETING) |
| `GET /api/reports/today` | Métricas de la jornada (estados + tiempo medio de atención) |
| `GET /api/reports/advisor` `…/requester` `…/daily` | Reportes por fecha de atención |
| `GET /api/logs` | Registro de auditoría |
| `PUT …/tickets/:id {status:"UNSERVED"}` | Cancelar turno (no-show) |

## Tiempo real (Socket.IO)

Eventos `ticket_created`, `ticket_called`, `ticket_updated`, `video_updated`.
El socket se abre **solo** en las pantallas que lo usan (`/advisor`, `/screen`, `/admin`, `/marketing`); el kiosco y el login no crean conexiones. Ver conexiones activas: `podman logs turnero_backend_1 | grep "Client"`.

## Modelo de datos (Prisma / PostgreSQL)

- **User** — personas del sistema (rol, perfil de asesor, área, `requires_password_change`).
- **Area** — servicios del consultorio con prefijo de turno (`C001…`).
- **Ticket** — turno: estado (`WAITING/CALLING/SERVED/DONE/UNSERVED`), `service_date` (jornada), `called_at`, `served_at`; único por `(area_id, service_date, turn_number)`.
- **DailyCounter** — correlativo atómico por área y día.
- **Parameter** — configuración clave-valor.
- **Video** — playlist de la sala (orden, archivo en volumen `turnero-uploads`).
- **AuditLog** — quién hizo qué y cuándo (alimenta "Registro de Actividad").

## Operación del kiosco (impresión térmica)

Para impresión silenciosa sin diálogo: lanzar Chrome/Edge del equipo kiosco con el flag `--kiosk-printing` y la impresora térmica como predeterminada. En la LAN basta abrir `http://<ip-del-servidor>:8080/`.

## Documentos del repositorio

- `docs/plan-backend.md` / `docs/plan-frontend.md` — planes de mejora (todas las fases 0–5 ejecutadas a 2026-09-23).
- `docs/despliegue.md` — comandos de la pila Podman y verificación.
- Este documento — referencia funcional rápida.
