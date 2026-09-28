require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all for prototype
    methods: ['GET', 'POST', 'PUT']
  }
});
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

// JWT: el secreto es obligatorio; sin él la firma no tiene sentido (I1).
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET no está definido. Configúralo en el entorno antes de arrancar.');
  process.exit(1);
}

// Ensure uploads dir
const uploadsDir = path.join(__dirname, 'uploads', 'videos');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer Storage — validación en dos capas (I8):
// 1) extensión/MIME declarados, 2) magic bytes reales tras escribir a disco.
const ALLOWED_VIDEO_EXTS = ['.mp4', '.webm'];
const ALLOWED_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB (el cliente comprime antes de subir)
const MAX_VIDEOS = 4;
const MAX_IMAGES = 10;
const IMAGE_DISPLAY_MS = 12000; // 12s por imagen en la pantalla de sala

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_VIDEO_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_VIDEO_EXTS.includes(ext) && !ALLOWED_IMAGE_EXTS.includes(ext)) {
      return cb(new Error('Solo se permiten videos MP4/WebM o imágenes JPG/PNG/WebP'));
    }
    cb(null, true);
  }
});

// Sniffer de magic bytes: MP4/MOV tienen 'ftyp' en los bytes 4-8;
// WebM/MKV empiezan con la cabecera EBML 1A 45 DF A3.
const hasVideoMagicBytes = (filePath) => {
  const fd = fs.openSync(filePath, 'r');
  const head = Buffer.alloc(12);
  fs.readSync(fd, head, 0, 12, 0);
  fs.closeSync(fd);
  const isMp4 = head.toString('ascii', 4, 8) === 'ftyp';
  const isWebm = head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
  return isMp4 || isWebm;
};

// Magic bytes de imágenes: JPEG FF D8 FF / PNG 89 50 4E 47 / WebP "RIFF"...."WEBP"
const hasImageMagicBytes = (filePath) => {
  const fd = fs.openSync(filePath, 'r');
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  fs.closeSync(fd);
  const isJpg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const isWebp = head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP';
  return isJpg || isPng || isWebp;
};

// Compresión de video server-side con ffmpeg: H.264 CRF 28, escala ≤1920,
// AAC 96k, faststart. Resuelve con la ruta comprimida SOLO si quedó más
// chico que el original; si ffmpeg falla o no mejora, se conserva el original.
const { execFile } = require('child_process');
const compressVideoWithFFmpeg = (filePath) => new Promise((resolve) => {
  const outPath = filePath.replace(/\.[^.]+$/, '') + '-c.mp4';
  execFile('ffmpeg', [
    '-y', '-i', filePath,
    '-vf', "scale='min(1920,iw)':-2",
    '-c:v', 'libx264', '-crf', '28', '-preset', 'veryfast',
    '-c:a', 'aac', '-b:a', '96k',
    '-movflags', '+faststart',
    outPath
  ], { timeout: 300000 }, (err) => {
    try {
      if (err || !fs.existsSync(outPath)) return resolve(null);
      const origSize = fs.statSync(filePath).size;
      const newSize = fs.statSync(outPath).size;
      if (newSize >= origSize) { fs.unlinkSync(outPath); return resolve(null); }
      fs.unlinkSync(filePath);
      resolve(outPath);
    } catch (e) {
      resolve(null);
    }
  });
});

app.use(cors());
// Logger HTTP simple y estructurado (operación en LAN)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/socket.io')) return;
    console.log(`[http] ${req.method} ${req.path} -> ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health-check para el orquestador y monitoreo básico
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'up', uptime: Math.round(process.uptime()) });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Authorization Middleware: exige uno de los roles indicados
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  next();
};

// Rate limiting básico en login (fuerza bruta en LAN)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Inténtalo más tarde.' }
});

// Login
app.post('/api/login', loginLimiter, async (req, res) => {
  const { id_number, password } = req.body;
  const user = await prisma.user.findUnique({ where: { id_number } });

  // Misma respuesta para usuario inexistente y contraseña errada (no enumerar cuentas)
  if (!user || !user.password) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  const valid = await bcrypt.compare(password, user.password).catch(() => false);
  if (!valid) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  logAction({ user, action: 'LOGIN', entity: 'auth', entityId: user.id });

  const token = jwt.sign({ id: user.id, name: user.name, role: user.role, area_id: user.area_id }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, name: user.name, role: user.role, area_id: user.area_id, advisor_profile: user.advisor_profile, requires_password_change: user.requires_password_change } });
});

// Change Password — siempre exige la contraseña actual (I9)
app.post('/api/change-password', authenticateToken, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!new_password || new_password.trim().length < 8) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
    }
    if (!current_password) {
      return res.status(400).json({ error: 'Debes ingresar tu contraseña actual' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const valid = await bcrypt.compare(current_password, user.password).catch(() => false);
    if (!valid) {
      return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword, requires_password_change: false }
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Users — solo ADMIN. Nunca exponer el hash de la contraseña (I2).
const publicUserSelect = {
  id: true, name: true, id_number: true, role: true,
  advisor_profile: true, area_id: true, requires_password_change: true,
  area: true
};

app.get('/api/users', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  const users = await prisma.user.findMany({ select: publicUserSelect });
  res.json(users);
});

// Listado ligero para que asesores elijan suplentes (I2)
app.get('/api/users/suplentes', authenticateToken, requireRole('ADVISOR', 'ADMIN'), async (req, res) => {
  const suplentes = await prisma.user.findMany({
    where: { role: 'ADVISOR', advisor_profile: 'SUPLENTE' },
    select: { id: true, name: true, area_id: true }
  });
  res.json(suplentes);
});

app.post('/api/users', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    } else {
      data.password = await bcrypt.hash('password123', 10);
    }
    if (data.area_id === '') data.area_id = null;
    if (data.area_id) data.area_id = parseInt(data.area_id, 10);
    
    const user = await prisma.user.create({ data });
    logAction({ user: req.user, action: 'USER_CREATED', entity: 'user', entityId: user.id, detail: { name: user.name, role: user.role } });
    const { password, ...safeUser } = user;
    res.json(safeUser);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.put('/api/users/:id', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    } else {
      delete data.password;
    }
    if (data.area_id === '') data.area_id = null;
    if (data.area_id) data.area_id = parseInt(data.area_id, 10);

    const user = await prisma.user.update({
      where: { id: parseInt(req.params.id) },
      data
    });
    logAction({ user: req.user, action: 'USER_UPDATED', entity: 'user', entityId: user.id, detail: { name: user.name, role: user.role, password_changed: !!data.password } });
    const { password, ...safeUser } = user;
    res.json(safeUser);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/users/:id/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = parseInt(req.params.id);

    if (req.user.id !== userId) {
      return res.status(403).json({ error: "No autorizado" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) {
      return res.status(401).json({ error: "La contraseña actual es incorrecta" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { password: hashed, requires_password_change: false },
    });

    res.json(updatedUser);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.delete('/api/users/:id', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
    }
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (target.role === 'ADMIN') {
      const admins = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (admins <= 1) return res.status(400).json({ error: 'No se puede eliminar al último administrador' });
    }
    await prisma.user.delete({ where: { id: userId } });
    logAction({ user: req.user, action: 'USER_DELETED', entity: 'user', entityId: userId, detail: { name: target.name, role: target.role } });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Areas
app.get('/api/areas', async (req, res) => {
  const areas = await prisma.area.findMany();
  res.json(areas);
});
app.post('/api/areas', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const area = await prisma.area.create({ data: req.body });
    logAction({ user: req.user, action: 'AREA_CREATED', entity: 'area', entityId: area.id, detail: { name: area.name } });
    res.json(area);
  } catch(err) {
    res.status(400).json({ error: err.message });
  }
});
app.put('/api/areas/:id', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const area = await prisma.area.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    });
    res.json(area);
  } catch(err) {
    res.status(400).json({ error: err.message });
  }
});

// Parameters
app.get('/api/parameters', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  const params = await prisma.parameter.findMany();
  res.json(params);
});
app.post('/api/parameters', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  const { key, value } = req.body;
  const param = await prisma.parameter.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  });
  res.json(param);
});

// Config de la pantalla de sala. La pantalla es pública (sin token): solo
// expone parámetros de display, nunca datos internos. Para ESCRIBIR se exige
// canManageContent (ADMIN o MARKETING), porque es config del contenido.
const IMAGE_SECONDS_KEY = 'image_display_seconds';
const TICKER_KEY = 'ticker_messages';
const MAX_TICKER_MSGS = 5;
const MAX_TICKER_CHARS = 160;
const DEFAULT_TICKER = [
  '🔔 Bienvenido al Consultorio Jurídico. Por favor tome su ticket y espere su turno. 🔔',
  '⚖️ Equidad y transparencia en cada paso. ⚖️',
  '🚀 Impulsando sistemas de gestión de colas eficientes. 🚀'
];
const clampImageSeconds = (raw) => {
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n >= 3 && n <= 120 ? n : null;
};
const parseTicker = (raw) => {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map(m => String(m)).filter(Boolean).slice(0, MAX_TICKER_MSGS);
  } catch {
    return null;
  }
};

app.get('/api/parameters/screen', async (req, res) => {
  const [secParam, tickerParam] = await Promise.all([
    prisma.parameter.findUnique({ where: { key: IMAGE_SECONDS_KEY } }),
    prisma.parameter.findUnique({ where: { key: TICKER_KEY } })
  ]);
  const seconds = clampImageSeconds(secParam?.value) ?? 12;
  const messages = (tickerParam && parseTicker(tickerParam.value)) || DEFAULT_TICKER;
  res.json({ image_display_seconds: seconds, ticker_messages: messages });
});

app.post('/api/parameters/screen', authenticateToken, canManageContent, async (req, res) => {
  const out = {};

  // Duración de imágenes (opcional en el body)
  if (req.body?.image_display_seconds !== undefined) {
    const seconds = clampImageSeconds(req.body.image_display_seconds);
    if (seconds === null) {
      return res.status(400).json({ error: 'La duración debe ser un número entero entre 3 y 120 segundos' });
    }
    await prisma.parameter.upsert({
      where: { key: IMAGE_SECONDS_KEY },
      update: { value: String(seconds) },
      create: { key: IMAGE_SECONDS_KEY, value: String(seconds) }
    });
    out.image_display_seconds = seconds;
  }

  // Mensajes del ticker de la pantalla (opcional en el body)
  if (req.body?.ticker_messages !== undefined) {
    const raw = req.body.ticker_messages;
    if (!Array.isArray(raw) || raw.length > MAX_TICKER_MSGS) {
      return res.status(400).json({ error: `ticker_messages debe ser un arreglo de máximo ${MAX_TICKER_MSGS} mensajes` });
    }
    const msgs = raw.map(m => String(m ?? '').trim());
    if (msgs.some(m => m.length > MAX_TICKER_CHARS)) {
      return res.status(400).json({ error: `Cada mensaje puede tener hasta ${MAX_TICKER_CHARS} caracteres` });
    }
    const clean = msgs.filter(Boolean);
    await prisma.parameter.upsert({
      where: { key: TICKER_KEY },
      update: { value: JSON.stringify(clean) },
      create: { key: TICKER_KEY, value: JSON.stringify(clean) }
    });
    out.ticker_messages = clean;
  }

  logAction({ user: req.user, action: 'PARAM_UPDATED', entity: 'parameter', entityId: 0, detail: out });
  io.emit('screen_config_updated', out);
  res.json(out);
});

// Tickets
// El kiosco y la pantalla de sala son públicos, pero nunca exponemos
// datos internos del asesor (I2): se proyectan campos mínimos.
const ticketInclude = {
  area: { select: { id: true, name: true, id_prefix: true } },
  advisor: { select: { id: true, name: true } }
};

// --- Jornada de servicio (I7) -------------------------------------------------
// El "día" de todo el sistema es hora local del servidor; en producción el
// contenedor corre con TZ=America/Bogota. Centralizado aquí para que tickets,
// limpieza y reportes corten el día de la misma manera.
const startOfServiceDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// Auditoría (Fase 3): registro best-effort, nunca rompe la operación principal.
const logAction = async ({ user = null, action, entity, entityId = null, detail = null }) => {
  try {
    await prisma.auditLog.create({
      data: {
        user_id: user?.id ?? null,
        user_name: user?.name ?? null,
        action,
        entity,
        entity_id: entityId,
        detail: detail ? JSON.stringify(detail) : null
      }
    });
  } catch (err) {
    console.error('[audit] error registrando', action, err.message);
  }
};

// Marca como UNSERVED los turnos colgados de jornadas anteriores (I4).
const cleanupStaleTickets = async () => {
  try {
    const result = await prisma.ticket.updateMany({
      where: {
        status: { in: ['WAITING', 'CALLING'] },
        service_date: { lt: startOfServiceDay() }
      },
      data: { status: 'UNSERVED' }
    });
    if (result.count > 0) console.log(`[cleanup] ${result.count} turnos de jornadas anteriores marcados UNSERVED`);
  } catch (err) {
    console.error('[cleanup] error:', err.message);
  }
};

app.get('/api/tickets', async (req, res) => {
  // Lectura pura (I4): la limpieza de turnos viejos corre como job, no aquí.
  const { status, area_id, advisor_profile, advisor_id, all_dates } = req.query;
  const where = {};
  if (status) where.status = status;
  if (area_id) where.area_id = parseInt(area_id);

  // Por defecto solo la jornada actual (M4); históricos vía parámetros.
  if (all_dates !== 'true') where.service_date = startOfServiceDay();

  if (advisor_profile === 'SUPLENTE') {
    where.advisor_id = parseInt(advisor_id);
  } else if (advisor_profile === 'PRINCIPAL') {
    // Principal should only pick up unassigned tickets
    where.advisor_id = null;
  }

  // Tope de seguridad: el histórico completo nunca viaja en una sola respuesta (M3)
  const take = Math.min(parseInt(req.query.take, 10) || 500, 1000);
  const tickets = await prisma.ticket.findMany({
    where,
    include: ticketInclude,
    orderBy: { created_at: 'asc' },
    take
  });
  res.json(tickets);
});

app.post('/api/tickets', async (req, res) => {
  const { requester_id_number, area_id } = req.body;
  const areaId = parseInt(area_id, 10);

  if (!Number.isInteger(areaId)) {
    return res.status(400).json({ error: 'Área inválida' });
  }
  if (typeof requester_id_number !== 'string' || !/^\d{6,12}$/.test(requester_id_number.trim())) {
    return res.status(400).json({ error: 'El número de documento debe tener entre 6 y 12 dígitos' });
  }

  const area = await prisma.area.findUnique({ where: { id: areaId } });
  if (!area) return res.status(404).json({ error: 'Area not found' });

  // Numeración atómica (C3): el contador diario por área se incrementa dentro
  // de la misma transacción que crea el ticket, y la constraint única
  // (area_id, service_date, turn_number) es la red de seguridad final.
  const day = startOfServiceDay();
  try {
    const ticket = await prisma.$transaction(async (tx) => {
      const counter = await tx.dailyCounter.upsert({
        where: { area_id_date: { area_id: areaId, date: day } },
        update: { last_number: { increment: 1 } },
        create: { area_id: areaId, date: day, last_number: 1 }
      });

      const turnNumber = `${area.id_prefix}${String(counter.last_number).padStart(3, '0')}`;

      return tx.ticket.create({
        data: {
          requester_id_number: requester_id_number.trim(),
          area_id: areaId,
          status: 'WAITING',
          turn_number: turnNumber,
          service_date: day
        },
        include: ticketInclude
      });
    });

    io.emit('ticket_created', ticket);
    res.json(ticket);
  } catch (err) {
    if (err.code === 'P2002') {
      // Colisión: la constraint única atrapó algo que el contador no debió permitir.
      return res.status(409).json({ error: 'Conflicto generando el turno, inténtelo de nuevo' });
    }
    console.error('Error creando ticket:', err);
    res.status(500).json({ error: 'No se pudo crear el turno' });
  }
});

// Máquina de estados del turno (I5). El servidor valida cada transición y la
// toma del turno es condicional: dos asesores no pueden atender el mismo turno.
app.put('/api/tickets/:id', authenticateToken, requireRole('ADVISOR', 'ADMIN'), async (req, res) => {
  const { status } = req.body;
  const ticketId = parseInt(req.params.id, 10);
  const actorId = req.user.id;
  const isAdmin = req.user.role === 'ADMIN';

  if (!['CALLING', 'SERVED', 'DONE', 'UNSERVED'].includes(status)) {
    return res.status(400).json({ error: 'Transición de estado no permitida' });
  }

  try {
    if (status === 'CALLING') {
      // Llamar: tomar un turno libre, o re-llamar el que ya estoy atendiendo.
      const recall = await prisma.ticket.updateMany({
        where: { id: ticketId, status: 'CALLING', advisor_id: actorId },
        data: { updated_at: new Date() }
      });

      let claimed;
      if (recall.count === 0) {
        const result = await prisma.ticket.updateMany({
          where: isAdmin
            ? { id: ticketId, status: 'WAITING' }
            // Turno libre (cola del principal) o turno ya asignado a mí (suplente)
            : { id: ticketId, status: 'WAITING', OR: [{ advisor_id: null }, { advisor_id: actorId }] },
          data: { status: 'CALLING', advisor_id: actorId, called_at: new Date() }
        });
        if (result.count === 0) {
          return res.status(409).json({ error: 'El turno ya fue tomado por otro asesor o no está en espera' });
        }
        claimed = true;
      }

      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: ticketInclude });
      if (claimed) {
        logAction({ user: req.user, action: 'TICKET_CALL', entity: 'ticket', entityId: ticket.id, detail: { turn: ticket.turn_number } });
        io.emit('ticket_called', ticket); // anuncio y retiro en otros paneles
      }
      return res.json(ticket);
    }

    // Cancelación (no-show): solo ADMIN, desde WAITING o CALLING.
    if (status === 'UNSERVED') {
      if (!isAdmin) return res.status(403).json({ error: 'Solo un administrador puede cancelar turnos' });
      const result = await prisma.ticket.updateMany({
        where: { id: ticketId, status: { in: ['WAITING', 'CALLING'] } },
        data: { status: 'UNSERVED' }
      });
      if (result.count === 0) {
        return res.status(409).json({ error: 'El turno ya no es cancelable' });
      }
      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: ticketInclude });
      logAction({ user: req.user, action: 'TICKET_CANCELLED', entity: 'ticket', entityId: ticket.id, detail: { turn: ticket.turn_number } });
      io.emit('ticket_updated', ticket);
      return res.json(ticket);
    }

    // SERVED / DONE: solo el asesor que tiene el turno en CALLING (o un ADMIN).
    const result = await prisma.ticket.updateMany({
      where: isAdmin
        ? { id: ticketId, status: 'CALLING' }
        : { id: ticketId, status: 'CALLING', advisor_id: actorId },
      data: { status, ...(status === 'SERVED' ? { served_at: new Date() } : {}) }
    });
    if (result.count === 0) {
      return res.status(409).json({ error: 'El turno no está siendo atendido por ti' });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: ticketInclude });
    logAction({ user: req.user, action: `TICKET_${status}`, entity: 'ticket', entityId: ticket.id, detail: { turn: ticket.turn_number } });
    io.emit('ticket_updated', ticket);
    res.json(ticket);
  } catch (err) {
    console.error('Error actualizando ticket:', err);
    res.status(500).json({ error: 'No se pudo actualizar el turno' });
  }
});

// Transferencia Principal -> Suplente (C5). Ya no se clona el ticket: el mismo
// registro cambia de manos, conservando turn_number y área. La trazabilidad
// completa llega con el AuditLog de la Fase 3.
app.put('/api/tickets/:id/assign', authenticateToken, requireRole('ADVISOR', 'ADMIN'), async (req, res) => {
  const { suplente_id } = req.body;
  const ticketId = parseInt(req.params.id, 10);
  const suplenteId = parseInt(suplente_id, 10);

  if (!Number.isInteger(suplenteId)) {
    return res.status(400).json({ error: 'Suplente inválido' });
  }

  try {
    const suplente = await prisma.user.findUnique({ where: { id: suplenteId } });
    if (!suplente || suplente.role !== 'ADVISOR' || suplente.advisor_profile !== 'SUPLENTE') {
      return res.status(400).json({ error: 'El destinatario no es un asesor suplente válido' });
    }

    // Transferencia atómica: solo si el turno está en CALLING y lo atiende
    // quien hace la petición (o un ADMIN). count === 0 -> estado inválido.
    const result = await prisma.ticket.updateMany({
      where: req.user.role === 'ADMIN'
        ? { id: ticketId, status: 'CALLING' }
        : { id: ticketId, status: 'CALLING', advisor_id: req.user.id },
      data: { status: 'WAITING', advisor_id: suplenteId }
    });
    if (result.count === 0) {
      return res.status(409).json({ error: 'El turno no está siendo atendido por ti o ya no es transferible' });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, include: ticketInclude });
    logAction({ user: req.user, action: 'TICKET_TRANSFER', entity: 'ticket', entityId: ticket.id, detail: { turn: ticket.turn_number, to_suplente: { id: suplente.id, name: suplente.name } } });
    io.emit('ticket_updated', ticket); // el suplente lo ve aparecer; el principal lo pierde
    res.json(ticket);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Import dummy data / specific logic
app.post('/api/import', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  // Simple import logic for demonstration
  try {
    const { users, areas, parameters } = req.body;
    if (areas) await prisma.area.createMany({ data: areas, skipDuplicates: true });
    if (users) await prisma.user.createMany({ data: users, skipDuplicates: true });
    if (parameters) await prisma.parameter.createMany({ data: parameters, skipDuplicates: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Videos — gestión de contenido permitida a ADMIN y MARKETING
function canManageContent(req, res, next) {
  if (req.user.role !== 'ADMIN' && req.user.role !== 'MARKETING') {
    return res.status(403).json({ error: 'Only admins or marketing can manage content' });
  }
  next();
}

// === Anuncios de audio para la pantalla de sala ===
// Generados LOCALMENTE: espeak-ng (voz) y ffmpeg (campanita). Cero internet,
// cero dependencia de las voces del navegador del kiosco (hallazgo medido:
// Chromium sin voces instaladas → el TTS del navegador nunca sonó).
// Cache en memoria: cada anuncio se genera una sola vez.
const audioCache = new Map();

const buildAnnounceText = (turnNumber, areaName) => {
  const spelled = [...String(turnNumber || '')].join(' '); // "U E 0 0 1"
  return `Turno ${spelled}. Acérquese al módulo ${areaName || ''}`.trim();
};

// Voz neural (piper): texto por stdin → WAV en archivo temporal.
// RAM pico medida: ~236MB por síntesis, transitoria. Cacheada arriba.
const synthWithPiper = (text) => new Promise((resolve, reject) => {
  const tmp = path.join(os.tmpdir(), `piper-${Date.now()}-${Math.round(Math.random() * 1e6)}.wav`);
  const child = execFile('piper', ['-m', process.env.PIPER_VOICE, '-f', tmp],
    { timeout: 30000, maxBuffer: 1024 * 1024 }, (err) => {
      if (err) {
        try { fs.unlinkSync(tmp); } catch { }
        return reject(err);
      }
      try {
        const buf = fs.readFileSync(tmp);
        fs.unlinkSync(tmp);
        if (buf.length > 1000 && buf.slice(0, 4).toString() === 'RIFF') return resolve(buf);
        reject(new Error('salida de piper inválida'));
      } catch (e) {
        reject(e);
      }
    });
  child.stdin.write(text + '\n');
  child.stdin.end();
});

// Red de seguridad: espeak-ng (robótica pero siempre disponible)
const synthWithEspeak = (text) => new Promise((resolve, reject) => {
  // encoding:'buffer' es CRÍTICO: stdout es un WAV binario; el default utf8
  // lo corrompe (bytes inválidos → U+FFFD). Este bug rompió la campanita
  // y los anuncios de espeak durante dos fases sin que se notara.
  execFile('espeak-ng', ['-v', 'es', '-s', '150', '--stdout', text],
    { maxBuffer: 10 * 1024 * 1024, encoding: 'buffer' }, (err, stdout) => err ? reject(err) : resolve(stdout));
});

app.get('/api/audio/announce/:ticketId', async (req, res) => {
  try {
    const id = parseInt(req.params.ticketId, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Ticket inválido' });
    const ticket = await prisma.ticket.findUnique({ where: { id }, include: { area: true } });
    if (!ticket) return res.status(404).json({ error: 'Ticket no encontrado' });
    const text = buildAnnounceText(ticket.turn_number, ticket.area?.name);
    if (!audioCache.has(text)) {
      let buf = null;
      try {
        buf = await synthWithPiper(text); // voz neural natural (sharvard es_ES)
      } catch (err) {
        console.warn('[audio/announce] piper falló, usando espeak-ng:', err.message);
        buf = await synthWithEspeak(text);
      }
      if (!buf || buf.length < 100) throw new Error('audio vacío');
      audioCache.set(text, buf);
    }
    res.set('Content-Type', 'audio/wav');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(audioCache.get(text));
  } catch (err) {
    console.error('[audio/announce]', err.message);
    res.status(500).json({ error: 'No se pudo generar el anuncio' });
  }
});

// Campanita: tono con envolvente de decaimiento (dos armónicos), generado
// con ffmpeg — reemplaza el MP3 externo de mixkit (requería internet).
app.get('/api/audio/ding', async (req, res) => {
  try {
    if (!audioCache.has('__ding__')) {
      const expr = '0.5*sin(2*PI*880*t)*exp(-5*t)+0.25*sin(2*PI*1320*t)*exp(-5*t)';
      // Archivo temporal + readFileSync (bytes reales, mismo patrón que piper):
      // el stdout binario por pipe se corrompía con el encoding utf8 default.
      const tmp = path.join(os.tmpdir(), `ding-${Date.now()}.wav`);
      await new Promise((resolve, reject) => {
        execFile('ffmpeg', ['-f', 'lavfi', '-i', `aevalsrc=${expr}:d=0.9`,
          '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', '-y', tmp],
          { timeout: 15000 }, (err) => err ? reject(err) : resolve());
      });
      const buf = fs.readFileSync(tmp);
      fs.unlinkSync(tmp);
      if (!buf || buf.length < 100 || buf.slice(0, 4).toString('ascii') !== 'RIFF') {
        throw new Error('ding inválido');
      }
      audioCache.set('__ding__', buf);
    }
    res.set('Content-Type', 'audio/wav');
    res.set('Cache-Control', 'public, max-age=604800');
    res.send(audioCache.get('__ding__'));
  } catch (err) {
    console.error('[audio/ding]', err.message);
    res.status(500).json({ error: 'No se pudo generar la campanita' });
  }
});

app.get('/api/videos', async (req, res) => {
  const videos = await prisma.video.findMany({ orderBy: [{ order: 'asc' }, { created_at: 'asc' }] });
  res.json(videos);
});

app.post('/api/videos', authenticateToken, canManageContent, upload.single('media'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    const isImage = ALLOWED_IMAGE_EXTS.includes(ext);
    const type = isImage ? 'image' : 'video';

    // Capa 2 (I8): verificar contenido real; si no matchea el tipo, fuera del disco.
    const filePath = path.join(uploadsDir, req.file.filename);
    const validContent = isImage ? hasImageMagicBytes(filePath) : hasVideoMagicBytes(filePath);
    if (!validContent) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: `El archivo no es ${isImage ? 'una imagen válida (JPG/PNG/WebP)' : 'un video válido (MP4/WebM)'}` });
    }

    // Límite de tamaño para imágenes (el cliente ya comprime; esto es red de seguridad)
    if (isImage && fs.statSync(filePath).size > MAX_IMAGE_BYTES) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: `La imagen supera el máximo de ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB` });
    }

    // Límites por tipo con flujo de sustitución para AMBOS tipos:
    // videos máx. 4, imágenes máx. 10. Sin replaceId → 409 con la lista actual;
    // con replaceId → se sustituye EN EL MISMO PUESTO (hereda el order).
    const count = await prisma.video.count({ where: { type } });
    const limit = type === 'image' ? MAX_IMAGES : MAX_VIDEOS;
    const label = type === 'image' ? 'imágenes' : 'videos';

    let replaced = null;
    if (count >= limit) {
      const replaceId = parseInt(req.body.replaceId, 10);
      if (!Number.isInteger(replaceId)) {
        // 409: el frontend muestra el selector de sustitución
        fs.unlinkSync(filePath);
        const currentMedia = await prisma.video.findMany({ where: { type }, orderBy: [{ order: 'asc' }, { created_at: 'asc' }] });
        return res.status(409).json({
          error: `Límite de ${limit} ${label} alcanzado. Seleccioná cuál querés sustituir.`,
          limitReached: true,
          type,
          media: currentMedia
        });
      }
      replaced = await prisma.video.findUnique({ where: { id: replaceId } });
      if (!replaced || replaced.type !== type) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ error: `El archivo a sustituir no existe o no es del tipo correcto` });
      }
      const oldPath = path.join(__dirname, 'uploads', 'videos', replaced.filename);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) { console.error('Error deleting replaced file', e); }
      }
      await prisma.video.delete({ where: { id: replaceId } });
    }

    // Compresión de video server-side (solo si mejora el tamaño)
    let finalFilename = req.file.filename;
    if (type === 'video') {
      const compressed = await compressVideoWithFFmpeg(filePath);
      if (compressed) finalFilename = path.basename(compressed);
    }

    const mediaUrl = `/uploads/videos/${finalFilename}`;

    // Sustitución IN PLACE: el nuevo archivo hereda el order del sustituido,
    // así aparece exactamente donde estaba el elegido (no al final).
    // Si no es sustitución, se agrega al final de la playlist.
    const total = await prisma.video.count();
    const newOrder = replaced ? replaced.order : total;

    const newMedia = await prisma.video.create({
      data: {
        filename: finalFilename,
        originalName: req.file.originalname,
        url: mediaUrl,
        type,
        active: true,
        order: newOrder
      }
    });

    logAction({ user: req.user, action: type === 'image' ? 'IMAGE_UPLOADED' : 'VIDEO_UPLOADED', entity: 'video', entityId: newMedia.id, detail: { originalName: newMedia.originalName, replaced: replaced ? replaced.originalName : null } });
    io.emit('video_updated');
    res.json(newMedia);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/videos/:id', authenticateToken, canManageContent, async (req, res) => {
  try {
    
    const videoId = parseInt(req.params.id);
    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video) return res.status(404).json({ error: 'Video not found' });
    
    const filePath = path.join(__dirname, 'uploads', 'videos', video.filename);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) { console.error('Error deleting file', e); }
    }
    
    await prisma.video.delete({ where: { id: videoId } });
    logAction({ user: req.user, action: 'VIDEO_DELETED', entity: 'video', entityId: videoId, detail: { originalName: video.originalName } });
    io.emit('video_updated');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/videos/reorder', authenticateToken, canManageContent, async (req, res) => {
  try {

    const { sequence } = req.body;

    await prisma.$transaction(
      sequence.map((item) =>
        prisma.video.update({
          where: { id: item.id },
          data: { order: item.order },
        })
      )
    );

    io.emit('video_updated');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Audit Log — solo ADMIN. Paginado, más recientes primero.
app.get('/api/logs', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const { action, limit } = req.query;
    const take = Math.min(parseInt(limit, 10) || 200, 500);
    const where = action ? { action } : {};
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take
    });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reports

// Resumen de la jornada actual (dashboard admin): conteos por estado y
// promedio de atención en minutos (served_at - called_at).
app.get('/api/reports/today', authenticateToken, requireRole('ADMIN'), async (req, res) => {
  try {
    const day = startOfServiceDay();
    const tickets = await prisma.ticket.findMany({
      where: { service_date: day },
      select: { status: true, called_at: true, served_at: true }
    });

    const byStatus = { WAITING: 0, CALLING: 0, SERVED: 0, DONE: 0, UNSERVED: 0 };
    let servedCount = 0;
    let totalMinutes = 0;
    tickets.forEach(t => {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      if (t.served_at && t.called_at) {
        servedCount += 1;
        totalMinutes += (t.served_at - t.called_at) / 60000;
      }
    });

    res.json({
      total: tickets.length,
      byStatus,
      avgAttentionMinutes: servedCount ? Math.round((totalMinutes / servedCount) * 10) / 10 : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/advisor', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Only admins can view reports' });
    const { advisor_id, startDate, endDate } = req.query;
    if (!advisor_id || !startDate || !endDate) return res.status(400).json({ error: 'Missing parameters' });
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const whereClause = {
      status: { in: ['SERVED', 'DONE'] },
      // Reporte por fecha de ATENCIÓN (M2); served_at null cae al created_at
      // para no perder datos anteriores a la Fase 3.
      OR: [
        { served_at: { gte: start, lte: end } },
        { served_at: null, created_at: { gte: start, lte: end } }
      ]
    };

    if (advisor_id !== 'todos') {
      whereClause.advisor_id = parseInt(advisor_id);
    }

    const tickets = await prisma.ticket.findMany({
      where: whereClause,
      include: { advisor: { select: { id: true, name: true } }, area: { select: { id: true, name: true, id_prefix: true } } },
      orderBy: [
        { advisor_id: 'asc' },
        { created_at: 'asc' }
      ]
    });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/requester', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Only admins can view reports' });
    const { requester_id_number } = req.query;
    if (!requester_id_number) return res.status(400).json({ error: 'Missing parameters' });

    const tickets = await prisma.ticket.findMany({
      where: {
        requester_id_number,
        status: { in: ['SERVED', 'DONE'] }
      },
      include: { advisor: { select: { id: true, name: true } }, area: { select: { id: true, name: true, id_prefix: true } } },
      orderBy: { created_at: 'desc' }
    });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/daily', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Only admins can view reports' });
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Missing date parameter' });

    // Día en hora local del servidor (TZ=America/Bogota), no en UTC (I7),
    // y por fecha de atención (M2) con fallback a creación para datos previos.
    const [year, month, dayNum] = date.split('-').map(Number);
    if (!year || !month || !dayNum) return res.status(400).json({ error: 'Fecha inválida (YYYY-MM-DD)' });
    const targetDate = new Date(year, month - 1, dayNum, 0, 0, 0, 0);
    const endOfDay = new Date(year, month - 1, dayNum, 23, 59, 59, 999);

    // Incluimos turnos sin asesor: el resumen los agrupa como "Sin asesor" (I6)
    const tickets = await prisma.ticket.findMany({
      where: {
        status: { in: ['SERVED', 'DONE'] },
        OR: [
          { served_at: { gte: targetDate, lte: endOfDay } },
          { served_at: null, created_at: { gte: targetDate, lte: endOfDay } }
        ]
      },
      include: { advisor: { select: { id: true, name: true } } }
    });

    const summary = {};
    tickets.forEach(t => {
      const advId = t.advisor?.id ?? 'sin-asesor';
      const advName = t.advisor?.name ?? 'Sin asesor';
      if (!summary[advId]) summary[advId] = { id: advId, name: advName, count: 0 };
      summary[advId].count += 1;
    });
    res.json(Object.values(summary));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Job de limpieza de jornada (I4): al arrancar y luego cada 5 minutos.
// Es idempotente y barato; reemplaza el UPDATE masivo que vivía dentro del GET.
cleanupStaleTickets();
const cleanupTimer = setInterval(cleanupStaleTickets, 5 * 60 * 1000);

// Manejador global de errores: traduce fallos comunes y no filtra internals.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'El video supera el tamaño máximo de 200 MB' });
  }
  if (err.message && err.message.includes('Solo se permiten videos')) {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === 'P2025') return res.status(404).json({ error: 'Registro no encontrado' });
  if (err.code === 'P2002') return res.status(409).json({ error: 'Conflicto de unicidad' });
  console.error('[error]', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Apagado limpio: podman/docker envían SIGTERM al detener el contenedor.
const shutdown = async (signal) => {
  console.log(`[shutdown] ${signal} recibido, cerrando...`);
  clearInterval(cleanupTimer);
  io.close();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`); // M1 corregido
});
