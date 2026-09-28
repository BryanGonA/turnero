# Plan de Mejora — Frontend

Base actual: React 18 + Vite, Tailwind (clases utilitarias), React Router, axios, socket.io-client, lucide-react, xlsx/jsPDF en reportes.

Severidades: 🔴 crítico · 🟠 importante · 🟡 menor.
Los códigos remiten al informe de auditoría; las fases están sincronizadas con `plan-backend.md`.

---

## 1. Autenticación y sesión (Fase 1)

### 1.1 Cliente HTTP centralizado — 🔴 C1 (lado cliente)
**Problema:** `api.js` repite `headers: { Authorization: Bearer ${localStorage...} }` a mano en solo algunas llamadas; varias llamadas protegibles van sin token.
**Plan:**
1. Interceptor de request en la instancia axios que inyecte el token automáticamente.
2. Interceptor de response: ante 401/403 → limpiar sesión y redirigir a `/login`.
3. Configurar `baseURL` por entorno (`import.meta.env.VITE_API_URL`) con fallback al host actual; esto permite servir el build detrás de un proxy en la LAN sin recompilar.

### 1.2 Guardas de ruta reales — 🟠 I3
**Problema:** `JSON.parse(localStorage.getItem('user'))` es falsificable (`{"role":"ADMIN"}` abre el panel admin) y puede lanzar excepción con datos corruptos.
**Plan:**
1. Componente `RequireAuth({ roles, children })` en `App.jsx` envolviendo `/advisor`, `/admin` (y verificando `role` del token, no solo del localStorage).
2. Parseo defensivo con try/catch y validación de forma (`{id, role, ...}`), cerrando sesión si es inválido.
3. Al cargar, opcionalmente validar el token contra `GET /api/me` (nuevo endpoint del backend) para detectar tokens expirados antes de operar.
4. Tras cambio de contraseña exitoso, re-emitir token o forzar re-login (el rol/flags del storage quedan obsoletos).

### 1.3 UX de sesión
- Mostrar nombre/rol del usuario en `Header` cuando hay sesión.
- Si `requires_password_change`, bloquear la navegación al modal (hoy se monta pero el usuario puede ignorarlo según la pantalla).

---

## 2. Sincronización en tiempo real (Fase 2, alineada con backend 2.2)

### 2.1 Estado de cola consistente en `AdvisorPage` — 🟠 I5
**Problemas actuales:**
- `ticket_created` se agrega sin deduplicar (perfil PRINCIPAL) → duplicados visibles.
- Cuando **otro** asesor toma un turno, esta pantalla nunca lo retira → turnos fantasma y doble atención.
- El slice `prev.slice(1)` tras "llamar siguiente" asume que el primero no cambió desde el render.

**Plan:**
1. Escuchar `ticket_called` y `ticket_updated` para **remover** el turno de `waitingTickets` (por id) cualquiera que sea su estado final.
2. Rehidratar la lista periódicamente (polling de respaldo cada 30–60 s o al evento `reconnect` del socket) — la LAN del consultorio pierde sockets con equipos en suspensión.
3. Manejar el 409 del backend ("turno ya tomado") con mensaje claro y retiro local del turno.
4. Deduplicar por `id` en todos los handlers (utilidad `upsertById`).

### 2.2 Pantalla de sala (`BigScreenPage`)
- Filtrar `GET /api/tickets` por fecha del día (M4) una vez el backend lo soporte.
- Voz: suscribirse a `voiceschanged` (`getVoices()` puede devolver `[]` al primer render) y reemplazar el `setTimeout(1500)` por encadenar la voz al evento `ended` del audio de alerta (M5).
- Reproteger `currentVideoIndex` al borrar videos (reordenar resetea a 0 ya, pero borrar el video activo puede dejar un índice fuera de rango → `videos[undefined]?.url` corta la playlist).
- `object-fit: cover` está escrito como clase CSS (`className="... object-fit:cover ..."`) en el `<video>`: no funciona como clase; pasar a la utilidad Tailwind `object-cover`.

### 2.3 SocketContext
- Reconexión automática con backoff (socket.io-client ya lo trae; configurar `reconnectionDelayMax` y loguear `disconnect` para diagnóstico en la LAN).
- No crear el socket hasta conocer el host configurado (misma fuente de verdad que `api.js`).

---

## 3. Kiosco e impresión (Fase 2)

`RequesterPage.jsx`:
1. **Reset del kiosco fiable:** hoy hay dos timers (10 s de reset + 1 s tras `afterprint`) que pueden competir con la pantalla de diálogo de impresión. Definir una única máquina: `ticket mostrado → (print o timeout) → reset`. Documentar que la impresión silenciosa depende de `--kiosk-printing` en el equipo (ya descrito en las transcripciones del proyecto; moverlo a un `docs/operacion-kiosco.md`).
2. **Protección anti doble-submit:** `loading` ya deshabilita, pero añadir `disabled` también al teclado numérico durante el envío.
3. **Validación mínima del documento** (largo 6–12 dígitos) antes de habilitar "Imprimir turno" — hoy acepta cualquier cadena corta y el backend no valida.
4. **Manejo de error visible:** reemplazar `alert('Error creating ticket')` por un mensaje en pantalla acorde al diseño, y permitir reintentar sin perder el área seleccionada (hoy solo se limpia en éxito — correcto — pero el `alert` rompe la estética del kiosco).
5. Áreas: si el fetch falla (backend caído), mostrar estado de "servicio no disponible" en lugar de una pantalla vacía muda.

---

## 4. Panel de administración (Fases 3–4)

1. **Pestañas fantasma:** `params` y `logs` existen en el sidebar pero sin contenido ni datos (el backend no tiene GET de logs). Implementar `AuditLog` (backend Fase 3) y renderizar la tabla; hasta entonces, ocultar ambas pestañas para no prometer funcionalidad inexistente.
2. **Gestión de usuarios:**
   - No permitir borrar al último ADMIN ni al usuario autenticado (el backend debe validarlo; el frontend lo anticipa).
   - Al editar, no enviar campos de contraseña vacíos (ya está) y confirmar borrado con modal, no acción directa.
   - Mostrar `requires_password_change` en la tabla.
3. **Gestión de áreas:** validar prefijo único en cliente y mostrar el error de unicidad que devuelve Prisma (hoy llega como `err.message` crudo).
4. **Videos:** barra de progreso de subida (axios `onUploadProgress`), previsualización antes de guardar, y confirmación de borrado.
5. **Vista de cola global (Fase 5):** pestaña nueva con turnos del día en todos los estados, con opciones de cancelar/no-show para el administrador.

---

## 5. Reportes (Fase 3)

- Tras el cambio a `served_at` (backend M2), etiquetar los filtros como "fecha de atención".
- Tabla de resultados con paginación local y totales (los XLSX/PDF ya funcionan; reutilizar su mapeo para el pie de tabla).
- Guardar últimos filtros usados en `sessionStorage` para no reconfigurar cada consulta.

---

## 6. Calidad de código y build (transversal)

1. **Eliminar duplicados y restos:** `pages/borra.js`, `public/listado1.txt`, `dist/listado1.txt`, el comentario "Base URL for dev", y los dos árboles `turnero/`/`turnero_0/` (decisión de Fase 0).
2. **README real:** reemplazar la plantilla de Vite por instalación, variables de entorno (`VITE_API_URL`), build y despliegue detrás del backend o Nginx en la LAN.
3. **ESLint:** el config existe pero no hay script `lint` en `package.json`; añadirlo y corregir warnings (hay `borra.js` y dependencias no usadas).
4. **Estado de carga/error uniforme:** pequeño hook `useApi` o al menos un patrón común; hoy cada fetch hace `console.error` silencioso y la UI queda en estado ambiguo.
5. **Accesibilidad del kiosco:** los botones numéricos usan solo click — verificar foco/tamaño táctil mínimo y contraste; `aria-live` en la pantalla de sala para el turno llamado (además de la voz).
6. **Internacionalización de fechas coherente** con la zona del backend (`es-CO`), evitando mezclar `es-ES`.

---

## 7. Checklist de salida del frontend

- [ ] Ninguna llamada protegida sale sin token (revisar pestaña Network).
- [ ] Falsificar `localStorage.user` no abre `/admin` (el guard valida rol/token).
- [ ] Token expirado → redirección limpia a login, sin pantalla rota.
- [ ] Dos asesores en la misma cola: el turno desaparece de ambas listas al ser llamado; el perdedor ve 409.
- [ ] Kiosco: sin turnos duplicados por doble clic; reset fiable tras impresión/cancelación.
- [ ] Pantalla de sala: voz encadenada al audio, sin índices de video inválidos al editar la playlist.
- [ ] Pestañas `params`/`logs` funcionales u ocultas.
- [ ] `npm run lint` y `npm run build` limpios; README con despliegue LAN.
