# Auditoría y Roadmap de funcionalidades — Turnero Consultorio Jurídico

> Auditoría con verificación en vivo (2026-09-28). Los "hallazgos" están
> medidos contra el stack real, no estimados.

## 1. Estado verificado (qué existe y funciona)

| Área | Estado | Evidencia |
|---|---|---|
| Kiosco táctil (módulo → cédula → imprimir) | ✓ wizard 2 pasos, adaptativo sin scroll | E2E 5 viewports |
| Pantalla de sala (héroe, cola, playlist, ticker) | ✓ con voz piper LATAM + campanita | E2E ciclo completo |
| Flujo de turnos (tomar → llamar → atender/finalizar) | ✓ WAITING→CALLING→{SERVED\|DONE} | E2E 10/10 |
| Gestión de medios (4 videos / 10 imgs, sustitución, prioridad, ciclo, compresión) | ✓ | E2E 13/13 |
| Voz anuncios | ✓ piper es_MX + fallback espeak | WAVs verificados |
| Admin (cola, usuarios, áreas, búsqueda, reportes, logs, parámetros) | ✓ | E2E 8/8 |
| Jornada diaria (M4) + limpieza nocturna | ✓ (históricos preservados: 110+) | SQL directo |
| Seguridad base | ✓ bcrypt, JWT, rate limiting login (30/15min), magic bytes en subidas | código verificado |

## 2. Deuda y riesgos actuales (hallazgos medidos)

| # | Hallazgo | Severidad | Nota |
|---|---|---|---|
| D1 | ~~Repo sin ningún commit~~ → **RESUELTO**: repo en `turnero/` con commits por unidad de trabajo | ✅ | 2026-09-28 |
| D2 | ~~Sin backup~~ → **RESUELTO**: `backup.sh` con rotación, restauración probada en base scratch | ✅ | 2026-09-28 |
| D3 | ~~AC sin asesor~~ → **RESUELTO**: asesor3 creado y verificado en AC | ✅ | 2026-09-28 |
| D4 | Healthchecks: solo la BD (backend/frontend sin) | 🟠 | El stack se encontró caído 2 veces en silencio durante el desarrollo |
| D5 | Backend monolítico: `index.js` de 1.154 líneas | 🟠 Mantenibilidad | 0 tests; refactor arriesgado sin red |
| D6 | 24 errores eslint (estructura de effects, en 10 archivos) | 🟠 | Deuda preexistente |
| D7 | JWT_SECRET placeholder + contraseñas default | 🟠 (prod) | Checklist en docs/credenciales.md |
| D8 | Sin deleteArea (CRUD de áreas incompleto) | 🟡 | Restricciones FK con tickets |

## 3. Brainstorming priorizado

### P0 — Necesario (riesgo operativo real)

| Funcionalidad | Qué resuelve | Esfuerzo |
|---|---|---|
| **Git: commits iniciales por unidad de trabajo** | D1 — resguardo de todo lo construido | S |
| **Backup automático de PostgreSQL** (script `backup.sh` con pg_dump + rotación, cron sugerido) | D2 — pérdida de datos | S |
| **Asignar asesor al módulo AC** (admin → Usuarios, o crear asesor3) | D3 — turnos huérfanos | S |
| **Healthchecks de backend/frontend en compose** + alerta simple (ping periódico → log/telegram) | D4 — caídas silenciosas | S-M |

### P1 — Alto valor funcional (lo que un turnero real necesita y falta)

| Funcionalidad | Qué resuelve | Esfuerzo |
|---|---|---|
| ~~Turno prioritario~~ → **IMPLEMENTADO** (2026-09-28): toggle en kiosco, badge en ticket, ★ en asesor y pantalla, prioridad primera en el orden de llamada, anuncio de voz "con prioridad" | ✓ 15/15 E2E | Hecho |
| ~~Tiempo estimado de espera~~ → **IMPLEMENTADO** (2026-09-28): posición en fila + promedio histórico de atención por módulo, en el ticket del kiosco | ✓ E2E | Hecho |
| **Reportes por módulo** (turnos/espera por área, hora pico; hoy solo por asesor y resumen diario) | Operación: dimensionar personal por módulo | S-M |
| **"Cerrar jornada"** con resumen (admin: marcar pendientes UNSERVED + exportar resumen del día en un clic, en vez del job nocturno) | Cierre operativo formal | S |
| **Notificación WhatsApp** del turno ("te falta 1 persona") | Los estudiantes se alejan del TV; hoy solo hay pantalla | L (API externa + costo) |

### P2 — Experiencia

| Funcionalidad | Notas | Esfuerzo |
|---|---|---|
| **Estado del turno por QR/celular** (ticket impreso con QR → "posición en fila y llamado") | Compañero digital del papel | M |
| **Ticket digital opcional** (cédula como identificador, sin papel) | Ahorra impresora térmica | M |
| **Pantalla: cola por módulo** (chips UE/AE/AC con conteo individual) | Claridad en salas concurridas | S |
| **Kiosco asistido por voz** (piper ya está: audio-guía para discapacidad visual + botón de texto grande) | Accesibilidad real con infra existente | M |
| **Modo "fuera de servicio"** del kiosco (admin pausa la fila: almuerzo, reuniones) | Operación diaria | S |
| Volumen de anuncios configurable desde admin | Ya hay patrón de parámetros de pantalla | S |

### P3 — Robustez técnica

| Funcionalidad | Nota | Esfuerzo |
|---|---|---|
| **Suite de smoke tests formal** (los E2E de la sesión son la base: convertirlos en `tests/` con script único) | Red de seguridad para todo lo demás | S-M |
| **Tests de transiciones de turnos** (backend: la lógica crítica del negocio) | Después de smoke, antes del refactor | M |
| **Refactor `index.js` → routes/ services/** | Solo con tests verdes | M |
| **Limpiar los 24 errores eslint** | Deuda estructural de effects | S |
| `deleteArea` con validación FK (o soft-delete) | CRUD completo de áreas | S |
| CI (build + lint + smoke) cuando haya remoto | — | S |

### P4 — Futuro

- Agendamiento de citas (turno programado vs fila).
- Encuesta post-atención (QR en el ticket).
- Dashboard histórico con gráficas (demanda por hora/módulo).
- Multi-sede.

## 4. Recomendación inmediata (Top 5)

1. **Git inicial** (D1) — 30 minutos de trabajo que resguardan semanas.
2. **Backup.sh + rotación** (D2) — mismo nivel de urgencia.
3. **Asesor para AC** (D3) — decisión funcional tuya: ¿asesor nuevo o reasignar?
4. **Turno prioritario** (P1) — el mayor salto de valor funcional con piper ya instalado.
5. **Tiempo estimado de espera** (P1) — los datos ya existen (avg atención por área).

---
*Metodología: verificación directa (SQL, greps, E2E de la sesión, lint, git).
Investigación de dominio previa: Maguire (kioscos públicos), Qtech (pantallas
"now serving"), NN/g (percepción de espera). Detalle por fase en `odd/tasks/`.*
