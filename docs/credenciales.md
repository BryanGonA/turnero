# Credenciales y referencia rápida — Turnero Consultorio Jurídico

> **Stack de pruebas.** Todas las contraseñas de esta guía son valores por
> defecto para desarrollo/testing. Antes de producción, cambiarlas (ver
> [Checklist de producción](#checklist-de-producción) al final).

## Usuarios del sistema

| Usuario | Contraseña | Rol | Perfil | Módulo (área) |
|---|---|---|---|---|
| `admin` | `adminpassword` | ADMIN | — | Todos (administra usuarios, áreas, cola, reportes, parámetros, contenido) |
| `asesor1` | `asesor12345` | ADVISOR | PRINCIPAL | **UE** — Recepción de usuario y entrega de procesos |
| `asesor2` | `asesor12345` | ADVISOR | PRINCIPAL | **AE** — Atención a estudiantes |
| `suplente1` | `suplente12345` | ADVISOR | SUPLENTE | **UE** — Recepción de usuario y entrega de procesos |

**Nombres reales:** admin = *(seed)*, asesor1 = "Asesor Prueba", asesor2 = "Asesor B", suplente1 = "Suplente 1".

### Semántica de los perfiles

- **PRINCIPAL**: ve y llama los turnos **sin asignar** de su módulo; puede
  transferir un turno en atención a un suplente de su área.
- **SUPLENTE**: solo ve los turnos **asignados a él** (que un principal le
  haya transferido).
- ⚠️ **Ningún asesor cubre el módulo AC** (Atención Centro de conciliación):
  sus turnos no pueden ser llamados hasta asignar un asesor a esa área
  (admin → Usuarios → editar → área "Atención Centro de conciliación").

### Cambio de contraseña obligatorio

El sistema trae el flujo de primer-login: cualquier usuario creado o con
contraseña reseteada debe cambiarla al entrar (modal bloqueante). En este
stack de pruebas el flag está **desactivado** en los cuatro usuarios para
facilitar el uso. En producción, reactivarlo es la política de seguridad
correcta (el admin lo hace editando el usuario o reseteando la contraseña).

## URLs de la aplicación (servidor local)

| Vista | URL | Uso |
|---|---|---|
| Kiosco de turnos | `http://localhost:8080/` | Pantalla táctil: elegir módulo → cédula → imprimir |
| Pantalla de sala | `http://localhost:8080/screen` | TV de espera: héroe de llamado, cola, playlist, ticker |
| Login | `http://localhost:8080/login` | Asesores, admin y marketing |
| Panel asesor | `http://localhost:8080/advisor` | Llamar / atender / finalizar / transferir turnos |
| Panel admin | `http://localhost:8080/admin` | Cola del día, usuarios, áreas, contenido, reportes, parámetros, logs |
| Contenido (marketing) | `http://localhost:8080/marketing` | Playlist, duración de imágenes, mensajes del ticker |
| API | `http://localhost:3001/api` | REST + sockets (ver `frontend/src/services/api.js`) |

## Módulos del consultorio

| Prefijo | Módulo |
|---|---|
| **UE** | Recepción de usuario y entrega de procesos |
| **AE** | Atención a estudiantes |
| **AC** | Atención Centro de conciliación *(sin asesor asignado — ver arriba)* |

## Infraestructura (contenedores, `turnero/docker-compose.yml`)

| Servicio | Imagen base | Puerto | Credenciales |
|---|---|---|---|
| `db` | postgres:16-alpine | 5432 | usuario `turnero` / contraseña `turnero` / base `turnero` |
| `backend` | node:20-bookworm-slim (+ piper, ffmpeg, espeak-ng) | 3001 | — (token JWT por login) |
| `frontend` | node → nginx | 8080 | — |

- **JWT_SECRET** (en `docker-compose.yml`): `cambia-esto-en-produccion` —
  es un placeholder. En producción usar un secreto largo y aleatorio.
- Conexión directa a la BD (debug):
  `podman exec -it turnero_db_1 psql -U turnero -d turnero`

## Comandos rápidos

```bash
cd turnero
./install.sh                        # instalar/actualizar TODO el stack (servidor)
./kiosk.sh [ip-del-servidor]        # abrir pantalla de sala (Linux, modo kiosco)
kiosk.bat [ip-del-servidor]         # ídem en Windows
./redeploy-frontend.sh              # publicar cambios de frontend a :8080

podman-compose down                 # detener (conserva datos)
podman-compose up -d --build        # reconstruir y levantar
podman logs turnero_backend_1 -f    # logs del backend
```

## Checklist de producción

1. Cambiar la contraseña de `admin`.
2. Reativar el cambio de contraseña obligatorio y resetear las de los
   asesores (política de primer-login).
3. `JWT_SECRET` aleatorio y secreto (no commitearlo).
4. Contraseña de PostgreSQL distinta de `turnero` (variable en compose).
5. Exponer solo el frontend (nginx) y la API pública necesaria; la BD no
   debe ser alcanzable desde la red de la sala.
6. Lanzar el kiosco y la pantalla con `kiosk.sh` (incluye el flag de
   autoplay necesario para que campanita y voz suenen desde el arranque).

---
*Última actualización: 2026-09-28. Historial de verificaciones en `odd/tasks/`.*
