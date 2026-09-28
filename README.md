# Turnero — Consultorio Jurídico (Universidad Libre, Seccional Cali)

Sistema de gestión de turnos con kiosco táctil, pantalla de sala con voz
neural, atención por asesores (principal/suplente) y administración completa.

## Instalación rápida (Linux)

```bash
git clone <este-repo> && cd turnero
./install.sh
```

Eso es todo. El instalador verifica el runtime (podman o docker), construye y
levanta el stack, y **verifica** que todo funcione: backend, módulos seedeados,
login, voz de anuncios, kiosco y pantalla.

**Requisitos:** Linux x86_64 · ~4 GB de RAM recomendados · podman (o docker).
Si no tenés el runtime, el propio `install.sh` ofrece instalarlo con sudo.

> La primera construcción tarda varios minutos: descarga la voz neural
> (piper, es_MX ~60 MB) y la hornea dentro de la imagen del backend.

## Uso

| Comando | Qué hace |
|---|---|
| `./install.sh` | Instala/actualiza todo + verifica (arranque en verde) |
| `./kiosk.sh [ip]` | Abre la pantalla de sala en modo kiosco (Linux) |
| `kiosk.bat [ip]` | Ídem en Windows |
| `./verify.sh` | Re-verifica el sistema (8 chequeos) |
| `./backup.sh` | Respalda la BD con rotación de 14 |
| `./redeploy-frontend.sh` | Publica cambios del frontend a :8080 |

### Vistas

- **Kiosco** `http://localhost:8080/` — elegir módulo → cédula → imprimir.
  Incluye atención prioritaria (★) y espera estimada.
- **Pantalla de sala** `/screen` — héroe "Ahora atendiendo", cola, playlist
  audiovisual en ciclo, ticker editable, campanita + voz en español LATAM.
- **Asesor** `/advisor` — llamar (prioritarios primero), atender, finalizar,
  transferir a suplente.
- **Admin** `/admin` — cola del día, usuarios, áreas, Contenido de Pantalla,
  reportes, parámetros, registro de auditoría.

### Credenciales (stack de pruebas)

`admin/adminpassword` · `asesor1`, `asesor2`, `asesor3` (`asesor12345`) ·
`suplente1/suplente12345` — detalle completo y checklist de producción en
**docs/credenciales.md**.

## Arquitectura

```
podman/docker
├── db        PostgreSQL 16            (jornada diaria, datos persistentes)
├── backend   Node/Express + Prisma   (API + sockets + piper/ffmpeg/espeak)
└── frontend  Vite → nginx             (React 19 + Tailwind v4)
```

Documentación completa en **docs/**: guía del proyecto, despliegue,
credenciales y roadmap de auditoría.
