# Turnero Consultorio Jurídico — Plan de Mejora

Sistema de gestión de turnos para el Consultorio Jurídico de la Universidad Libre, Seccional Cali.
Este directorio contiene el plan de mejora derivado de la auditoría de código realizada sobre la base actual.

## Documentos

| Documento | Contenido |
|---|---|
| [plan-backend.md](plan-backend.md) | Seguridad de API, consistencia de datos, modelo de dominio, observabilidad y despliegue |
| [plan-frontend.md](plan-frontend.md) | Autenticación de rutas, sincronización en tiempo real, kiosco/impresión, calidad de código |
| [despliegue.md](despliegue.md) | Stack Podman de pruebas: Postgres + backend + frontend, comandos y verificación |
| [guia-del-proyecto.md](guia-del-proyecto.md) | Referencia funcional: rutas, roles, API, eventos, modelo de datos |

## Contexto actual (estado auditado)

- **Stack:** React + Vite + Socket.IO client → Express 5 + Prisma + MySQL + Socket.IO, monolito `backend/index.js`.
- **Pantallas:** kiosco (`/`), login (`/login`), asesor (`/advisor`), pantalla de sala (`/screen`), admin (`/admin`).
- **Roles:** `ADMIN`, `ADVISOR` (con perfiles `PRINCIPAL` / `SUPLENTE`), `REQUESTER`.
- **Dominio sensible:** se registran números de cédula asociados a áreas de consulta jurídica → aplica Ley 1581 (Habeas Data). La seguridad de acceso no es opcional.

## Roadmap por fases

Las fases están ordenadas por riesgo sobre el negocio, no por facilidad técnica. Los identificadores (C1, I3, M2…) remiten a los hallazgos de la auditoría.

### Fase 0 — Higiene del repositorio (1 día) ✅ Implementada (2026-09-23, archivo en `_archivo/`)
- Eliminar la copia duplicada `turnero_0/` o archivarla fuera del árbol de trabajo.
- Sacar `backend/.env` de cualquier ubicación versionada/compartida; rotar la contraseña de MySQL (expuesta) y crear un usuario dedicado sin privilegios de `root`.
- Archivar los `docuproc*.txt` / `docproc*.txt` (transcripciones de sesiones de IA) fuera del repo, condensando lo útil en estos documentos.
- Eliminar `borra.js`, `test-db.js`, `listado*.txt`.
- Estandarizar: una sola fuente de verdad del código, un `.gitignore` de raíz.

### Fase 1 — Seguridad (bloqueo de operación con datos reales) ✅ Implementada (2026-09-23)
Objetivo: ningún dato personal accesible sin autenticación, y trazabilidad por cuenta.
- Backend: autenticación y autorización por rol en todos los endpoints (C1), login solo con bcrypt (C4), JWT con expiración y secreto obligatorio (I1), respuestas sin hashes (I2), cambio de contraseña con verificación de la actual (I9).
- Frontend: interceptor axios con token, guardas de ruta reales, eliminación de la confianza en `localStorage` como única defensa (I3).
- Criterio de salida: un pentest básico con `curl`/`nmap` en la LAN no obtiene ningún dato sin token.

### Fase 2 — Correctitud operativa (lo que se rompe frente al ciudadano) ✅ Implementada (2026-09-23)
- Numeración de turnos atómica con constraint única en BD (C3).
- Transiciones de estado validadas en servidor; dos asesores no pueden tomar el mismo turno (I5).
- Reescritura de la asignación Principal→Suplente como transferencia con auditoría, no como clonación (C5, M9).
- Limpieza diaria de turnos como job programado, no dentro del GET (I4).
- Zona horaria de Colombia explícita en toda la capa de fechas (I7).

### Fase 3 — Trazabilidad y datos para el consultorio ✅ Implementada (2026-09-23)
- Modelo `Ticket` con `called_at`, `served_at`, `transferred_from_id`, `serving_area_id` (reportes por fecha de atención, M2).
- Tabla de auditoría de acciones (quién llamó/atendió/transfirió/borró, cuándo) — da contenido real a la pestaña "Registro de Actividad" del admin, hoy vacía.
- Reporte diario tolerante a datos huérfanos (I6).

### Fase 4 — Robustez y operación ✅ Implementada (2026-09-23)
- Uploads validados por tipo/tamaño/magic bytes (I8, M6).
- Paginación de listados (M3) y filtros de fecha obligatorios en reportes.
- Observabilidad básica: logger estructurado, health-check, manejador global de errores.
- Documentación de despliegue en LAN (README operativo, servicio systemd/PM2, backup de MySQL).

### Fase 5 — Mejoras funcionales (posteriores, no bloqueantes) ✅ Parcial (2026-09-23: cola global + cancelación + métricas del día)
- Vista de cola global y cancelación/reasignación de turnos desde el admin.
- Métricas del día en el dashboard admin (turnos en espera, promedio de atención).
- Configuración por parámetros hoy huérfanos (la tabla `Parameter` existe pero nada la consume en la lógica de negocio).

## Reglas del plan

1. Cada cambio se entrega con su endpoint/pantalla afectada, prueba manual descrita y rollback posible.
2. Nada de Fase 2+ se despliega sin Fase 1 completada: no tiene sentido mejorar lógica sobre datos expuestos.
3. Toda decisión de dominio (numeración, triaje, reportes) queda documentada aquí, no en chats.
