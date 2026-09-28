# Plan de Mejora — Backend

Base actual: `backend/index.js` (monolito de 553 líneas), Express 5, Prisma 5, MySQL, Socket.IO, JWT, bcryptjs, multer.

Severidades: 🔴 crítico · 🟠 importante · 🟡 menor.
Los códigos (C1, I4…) corresponden al informe de auditoría.

---

## 1. Seguridad (Fase 1)

### 1.1 Autenticación y autorización globales — 🔴 C1
**Problema:** solo 6 de ~20 endpoints usan `authenticateToken`. Gestión de usuarios, áreas, parámetros, tickets e importación son públicos.
**Plan:**
1. Definir matriz de acceso explícita (tabla de decisión, pegada en este doc al implementar).
   Nota: se añadió el rol `MARKETING` (solo gestión de contenido audiovisual de la pantalla de sala):

| Endpoint | Público | Rol mínimo |
|---|---|---|
| `POST /api/login` | ✅ | — |
| `GET /api/areas` (solo `is_public`, sin datos internos) | ✅ kiosco | — |
| `POST /api/tickets` | ✅ kiosco | — |
| `GET /api/tickets?status=WAITING` (pantalla de sala, campos mínimos) | ✅ sala | — |
| `GET /api/tickets` (resto de filtros) | — | ADVISOR |
| `PUT /api/tickets/:id` | — | ADVISOR (y dueño/área válida) |
| `PUT /api/tickets/:id/assign` | — | ADVISOR + validaciones (M9) |
| `/api/users/*`, `/api/areas` (escritura), `/api/parameters`, `/api/import` | — | ADMIN |
| `/api/videos` (escritura) | — | ADMIN / MARKETING (implementado vía `canManageContent`) |
| `/api/reports/*` | — | ADMIN (ya OK) |

2. Crear middleware `requireRole(...roles)` y aplicarlo por rutas.
3. Endpoints públicos del kiosco/pantalla: devolver DTOs mínimos (sin `requester_id_number` en la pantalla de sala si no es necesario — mostrar solo `turn_number` y área reduce exposición de cédulas).
4. Restringir CORS (`origin` a los hosts de kiosco/sala/admin) y añadir rate-limit básico en `/api/login` (`express-rate-limit`) para frenar fuerza bruta en LAN.

### 1.2 Login solo con bcrypt — 🔴 C4
- Eliminar la comparación en claro `password !== user.password`; usar solo `bcrypt.compare`.
- Quitar el default `password @default("password123")` del schema: el campo queda obligatorio.
- Endpoint `/api/import`: prohibir passwords en claro (o hashear en el import); idealmente restringirlo a seed de áreas/parámetros.
- Migración: detectar usuarios cuyo password no empiece por `$2` y forzarlos a `requires_password_change = true`.

### 1.3 JWT robusto — 🟠 I1
- Fallar el arranque si `JWT_SECRET` no está definido (sin valor por defecto).
- Firmar con `expiresIn: '8h'` y emitir `iat`/`exp`; el frontend renovará con refresh simple de sesión o re-login.
- Incluir solo claims necesarios (`sub`, `role`, `area_id`).

### 1.4 Fuga de hashes — 🟠 I2
- `GET /api/users`: `select` explícito sin `password`; crear `GET /api/users/suplentes` (ADVISOR) con `{id, name}` solamente.
- Revisar todos los `include: { advisor: true, area: true }` (reports, tickets): proyectar campos, nunca devolver `password` por join.

### 1.5 Cambio de contraseña — 🟠 I9
- Unificar en un solo endpoint: `POST /api/change-password` debe exigir `current_password` y verificarlo con `bcrypt.compare`.
- Eliminar o alinear `PUT /api/users/:id/password` para no mantener dos vías divergentes.
- Validación de fortaleza mínima en servidor (longitud ≥ 8, no solo el `minLength={6}` del cliente).

### 1.6 Credenciales de BD — 🔴 C2
- `.env` fuera de versionado; usuario MySQL dedicado con privilegios solo sobre la base `turnero`.
- Variables de entorno validadas al arranque (`dotenv` + esquema mínimo: `DATABASE_URL`, `JWT_SECRET`, `PORT`).

### 1.7 Uploads — 🟠 I8 / 🟡 M6
- `fileFilter` por MIME/extensión (mp4/webm), `limits.fileSize` (p. ej. 200 MB), verificación de magic bytes con `file-type`.
- Autorización de rol **antes** de escribir a disco (middleware previo a multer) o borrado del archivo rechazado.

---

## 2. Correctitud y lógica de negocio (Fase 2)

### 2.1 Numeración de turnos atómica — 🔴 C3
**Problema:** read-then-write sin transacción → turnos duplicados bajo concurrencia (caso normal en kiosco).
**Plan:**
1. Nueva tabla `DailyCounter { area_id, date, last_number }` con PK compuesta `(area_id, date)`.
2. Generación dentro de `prisma.$transaction`: `upsert` con `increment: 1` y luego `create` del ticket con ese número.
3. Constraint única en BD sobre la combinación efectiva `(area_id, date(created_at), turn_number)` vía columna generada, como red de seguridad aunque la lógica falle.
4. Prueba de carga mínima: 50 requests concurrentes al kiosco deben producir 50 turnos únicos correlativos.

### 2.2 Máquina de estados validada en servidor — 🟠 I5
- `PUT /api/tickets/:id` reemplazado por acciones explícitas: `POST /api/tickets/:id/call`, `/serve`, `/done`, `/unserved`.
- Toma de turno con actualización condicional:
  `updateMany({ where: { id, status: 'WAITING', advisor_id: null }, data: { status: 'CALLING', advisor_id } })` → si `count === 0`, responder 409 "turno ya tomado". Esto elimina la doble atención.
- Emitir `ticket_called` también a los paneles de asesores (no solo a la pantalla) para que todos retiren el turno de su lista.

### 2.3 Rehacer asignación Principal→Suplente — 🔴 C5
**Problema:** clona el ticket (turno duplicado en BD y reportes), usa el área del suplente corrompiendo la numeración/estadística, no valida estado ni perfil.
**Plan:**
1. Eliminar el "turno espejo". La transferencia es: `update` del ticket original con `advisor_id = suplenteId, status = 'WAITING'` + fila en la tabla de auditoría (`action: 'TRANSFERRED', from_user_id, to_user_id`).
2. Validaciones: ticket en `CALLING`, pertenece al asesor autenticado (`req.user.id`), suplente existe y tiene `advisor_profile = 'SUPLENTE'`.
3. Mantener `area_id` original; si la pantalla del suplente requiere otra área de exhibición, usar un campo separado `serving_area_id`.
4. Un solo evento `ticket_updated` con el estado final.

### 2.4 Limpieza diaria fuera del GET — 🟠 I4
- Mover el `updateMany` de `UNSERVED` a un job (`node-cron` a las 00:05 hora Colombia) o ejecutarlo al primer evento del día.
- `GET /api/tickets` se vuelve lectura pura; además siempre filtrar por fecha (evita el M4 de la pantalla).

### 2.5 Zona horaria explícita — 🟠 I7
- Fijar `TZ=America/Bogota` en el proceso (o usar `date-fns-tz` para los cortes de día).
- Centralizar en un helper `todayRange()` usado por tickets, limpieza y reportes. Reportes: parsear la fecha como día local, no `new Date(date)` en UTC.

### 2.6 Reportes robustos — 🟠 I6 / 🟡 M2 / 🟡 M3
- Reportar por `served_at` (nuevo campo), no por `created_at`.
- `t.advisor?.id` con agrupación de "Sin asesor"; nunca asumir join no nulo.
- Paginación/tope en listados históricos (`take`/`skip`, fechas obligatorias en reportes).

---

## 3. Modelo de datos y trazabilidad (Fase 3)

```prisma
model Ticket {
  // existentes...
  called_at      DateTime?
  served_at      DateTime?
  transferred_from_id Int?
  serving_area_id     Int?   // si difiere del área de origen al exhibir
}

model AuditLog {
  id         Int      @id @default(autoincrement())
  user_id    Int?
  action     String   // TICKET_CALL, TICKET_SERVED, TICKET_TRANSFER, USER_CREATED, ...
  entity     String
  entity_id  Int
  detail     Json?
  created_at DateTime @default(now())
}
```

- Alimentar `AuditLog` desde los servicios de tickets, usuarios y reportes → la pestaña "Registro de Actividad" del admin pasa de decorativa a funcional.
- Definir `onDelete: Restrict` en relaciones User→Ticket para no poder borrar asesores con historial (o soft-delete con `active: Boolean`).

---

## 4. Estructura del código (transversal)

1. **Dividir el monolito:** `src/routes/{auth,users,areas,tickets,videos,reports}.js`, `src/services/`, `src/middleware/{auth,roles,errorHandler}.js`, `src/socket.js`. Sin lógica de negocio en handlers.
2. **Manejador global de errores:** eliminar los `res.status(400).json({ error: err.message })` dispersos (filtran internals de Prisma al cliente). Mapear errores Prisma (P2002 → 409, P2025 → 404).
3. **Validación de entrada:** `zod` por endpoint; hoy `req.body` va directo a Prisma (`create`/`update` de usuarios aceptan `/hacer/`cualquier campo, p. ej. fijar `role: 'ADMIN'` por body).
4. **Config y logs:** `pino` o `morgan` estructurado; endpoint `/health`; log del puerto corregido (M1).
5. **Tests:** arrancar por contratos críticos — login, numeración concurrente (2.1), máquina de estados (2.2), transferencia (2.3). Vitest + Prisma contra MySQL de test o `testcontainers`.
6. **Prisma client único** (una instancia compartida) y cierre limpio de conexiones/sockets en `SIGTERM`.

---

## 5. Checklist de salida del backend

- [ ] Ningún endpoint de la matriz 1.1 responde sin el rol correcto (probado con curl).
- [ ] 50 turnos concurrentes → 0 duplicados, numeración correlativa.
- [ ] Dos asesores llamando el mismo turno → uno recibe 409.
- [ ] Transferencia no crea tickets nuevos ni corrompe numeración.
- [ ] Ninguna respuesta JSON contiene `password`.
- [ ] JWT expira y el secreto faltante impide el arranque.
- [ ] Reportes por fecha de atención, en hora Colombia, sin 500 por datos huérfanos.
- [ ] `/health` responde; logs estructurados activos.
