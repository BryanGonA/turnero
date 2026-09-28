import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getVideos, uploadMedia, deleteMedia, reorderVideos, getScreenConfig, setScreenConfig } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { UploadCloud, Loader2, ChevronLeft, ChevronRight, Trash2, Star, Film, Image as ImageIcon, X, Clock, Check, MessageSquareText, Monitor } from 'lucide-react';

const currentHost = window.location.hostname;
const mediaUrl = (url) => `http://${currentHost}:3001${url}`;

// Compresión de imagen EN EL CLIENTE antes de subir: canvas → WebP q0.82,
// máx 1920px de lado mayor. Devuelve el File comprimido solo si quedó más
// chico que el original (si no, no hay ganancia y se sube el original).
async function compressImage(file) {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 1920;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
  } catch {
    return file;
  }
}

const MediaManager = () => {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  // Flujo de sustitución: el backend responde 409 con los 4 videos actuales
  const [replaceFile, setReplaceFile] = useState(null);
  const [replaceOptions, setReplaceOptions] = useState(null);
  const [replaceType, setReplaceType] = useState('video');
  const fileInputRef = useRef(null);
  const socket = useSocket();
  // Duración configurable de cada imagen en la pantalla de sala
  const [imgSeconds, setImgSeconds] = useState(12);
  const [savedImgSeconds, setSavedImgSeconds] = useState(12);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  // Mensajes del ticker de la pantalla: 5 slots, máx 160 caracteres cada uno
  const [tickerDraft, setTickerDraft] = useState(['', '', '', '', '']);
  const [savedTicker, setSavedTicker] = useState([]);
  const [savingTicker, setSavingTicker] = useState(false);
  const [tickerSaved, setTickerSaved] = useState(false);
  // Modal de subida: la subida es una ACCIÓN puntual, no un bloque permanente
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fetchMedia = useCallback(async () => {
    try {
      const res = await getVideos();
      setMedia(res.data || []);
    } catch (err) {
      setError('Error cargando los archivos multimedia');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMedia(); }, [fetchMedia]);

  useEffect(() => {
    getScreenConfig()
      .then(res => {
        if (Number.isInteger(res.data.image_display_seconds)) {
          setImgSeconds(res.data.image_display_seconds);
          setSavedImgSeconds(res.data.image_display_seconds);
        }
        if (Array.isArray(res.data.ticker_messages)) {
          const padded = [...res.data.ticker_messages, '', '', '', '', ''].slice(0, 5);
          setTickerDraft(padded);
          setSavedTicker(res.data.ticker_messages);
        }
      })
      .catch(() => {});
  }, []);

  // Otro gestor (o esta misma instancia tras cada cambio) refresca la playlist
  useEffect(() => {
    if (!socket) return;
    const handler = () => fetchMedia();
    const onConfig = (cfg) => {
      if (Number.isInteger(cfg?.image_display_seconds)) {
        setImgSeconds(cfg.image_display_seconds);
        setSavedImgSeconds(cfg.image_display_seconds);
      }
      if (Array.isArray(cfg?.ticker_messages)) {
        setTickerDraft([...cfg.ticker_messages, '', '', '', '', ''].slice(0, 5));
        setSavedTicker(cfg.ticker_messages);
      }
    };
    socket.on('video_updated', handler);
    socket.on('screen_config_updated', onConfig);
    return () => { socket.off('video_updated', handler); socket.off('screen_config_updated', onConfig); };
  }, [socket, fetchMedia]);

  const saveTicker = async () => {
    const msgs = tickerDraft.map(m => (m || '').trim());
    if (msgs.some(m => m.length > 160)) {
      setError('Cada mensaje del ticker puede tener hasta 160 caracteres');
      return;
    }
    if (msgs.filter(Boolean).length === 0) {
      setError('Ingresá al menos un mensaje para el ticker');
      return;
    }
    setError(null);
    setSavingTicker(true);
    setTickerSaved(false);
    try {
      await setScreenConfig({ ticker_messages: msgs });
      setSavedTicker(msgs.filter(Boolean));
      setTickerSaved(true);
      setTimeout(() => setTickerSaved(false), 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar los mensajes');
    } finally {
      setSavingTicker(false);
    }
  };

  const saveImageDuration = async () => {
    const value = parseInt(imgSeconds, 10);
    if (!Number.isInteger(value) || value < 3 || value > 120) {
      setError('La duración de la imagen debe ser entre 3 y 120 segundos');
      return;
    }
    setError(null);
    setSavingConfig(true);
    setConfigSaved(false);
    try {
      await setScreenConfig({ image_display_seconds: value });
      setSavedImgSeconds(value);
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar la duración');
    } finally {
      setSavingConfig(false);
    }
  };

  const sorted = [...media].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || new Date(a.created_at) - new Date(b.created_at)
  );
  const videos = sorted.filter(m => m.type !== 'image');
  const images = sorted.filter(m => m.type === 'image');

  const doUpload = async (file, replaceId) => {
    setError(null);
    setUploading(true);
    setProgress(0);
    const formData = new FormData();
    formData.append('media', file);
    if (replaceId) formData.append('replaceId', String(replaceId));
    try {
      await uploadMedia(formData, setProgress);
      setReplaceFile(null);
      setReplaceOptions(null);
      setUploadModalOpen(false); // éxito: cerrar y dejar que el grid hable
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.limitReached) {
        // Límite alcanzado (videos o imágenes): pedirle al usuario cuál sustituir
        setUploadModalOpen(false); // el modal de sustitución toma el relevo
        setReplaceOptions(err.response.data.media);
        setReplaceType(err.response.data.type || 'video');
        setReplaceFile(file);
      } else {
        setError(err.response?.data?.error || 'Error al subir el archivo');
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = null;
    }
  };

  // Los límites (4 videos / 10 imágenes) los decide el servidor: si el tipo
  // alcanzó su tope, responde 409 y se abre el modal de sustitución.
  const processFile = async (file) => {
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const finalFile = isImage ? await compressImage(file) : file;
    doUpload(finalFile);
  };

  const handleFileSelected = async (e) => {
    await processFile(e.target.files?.[0]);
    if (fileInputRef.current) fileInputRef.current.value = null; // permitir re-selección del mismo archivo
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    await processFile(e.dataTransfer?.files?.[0]);
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`¿Eliminar "${item.originalName}"? Esta acción no se puede deshacer.`)) return;
    setError(null);
    try {
      await deleteMedia(item.id);
    } catch (err) {
      setError('Error al eliminar el archivo');
    }
  };

  const move = async (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= sorted.length) return;
    const list = [...sorted];
    [list[index], list[target]] = [list[target], list[index]];
    try {
      await reorderVideos({ sequence: list.map((v, i) => ({ id: v.id, order: i })) });
    } catch (err) {
      setError('Error al reordenar');
    }
  };

  const makeFirst = async (index) => {
    if (index === 0) return;
    const list = [...sorted];
    const [item] = list.splice(index, 1);
    try {
      await reorderVideos({ sequence: [item, ...list].map((v, i) => ({ id: v.id, order: i })) });
    } catch (err) {
      setError('Error al cambiar la prioridad');
    }
  };

  return (
    <div>
      {/* SECCIÓN: Playlist de la pantalla */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black flex items-center gap-2">
            <Film size={18} className="text-primary" />
            Playlist de la pantalla
          </h2>
          <p className="text-xs text-text-muted mt-1">
            Se reproduce en ciclo: los videos completos y las imágenes según su duración configurada. Ajustá el orden con las flechas o la estrella (★ = mostrar primero).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setUploadModalOpen(true)}
          disabled={uploading}
          className="btn-primary px-5 py-2.5 text-sm flex items-center gap-2 shrink-0"
        >
          <UploadCloud size={18} />
          Agregar contenido
        </button>
      </div>

      {/* Contadores por tipo */}
      <div className="flex flex-wrap items-center gap-3 mb-6 text-sm font-semibold">
        <span className={`px-3 py-1.5 rounded-xl border ${videos.length >= 4 ? 'bg-primary/[0.06] border-primary/30 text-primary' : 'bg-gray-50 border-black/10 text-text-muted'}`}>
          <Film size={14} className="inline mr-1.5 -mt-0.5" />
          {videos.length}/4 videos
        </span>
        <span className={`px-3 py-1.5 rounded-xl border ${images.length >= 10 ? 'bg-primary/[0.06] border-primary/30 text-primary' : 'bg-gray-50 border-black/10 text-text-muted'}`}>
          <ImageIcon size={14} className="inline mr-1.5 -mt-0.5" />
          {images.length}/10 imágenes
        </span>
        <span className="text-text-muted ml-auto hidden lg:block">Las imágenes se comprimen automáticamente antes de subirse (WebP)</span>
      </div>

      {/* Playlist unificada */}
      {loading ? (
        <div className="text-center py-12 text-text-muted font-semibold">Cargando contenido...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sorted.length === 0 && (
            <div className="col-span-full text-center py-12 text-text-muted font-semibold bg-gray-50 rounded-2xl border border-black/10">
              Aún no hay contenido cargado.
            </div>
          )}
          {sorted.map((item, index) => {
            const isImage = item.type === 'image';
            return (
              <div key={item.id} className="glass-card p-4 flex flex-col gap-4 group">
                <div className="relative aspect-video rounded-xl overflow-hidden bg-black/50 border border-black/10">
                  {isImage ? (
                    <img src={mediaUrl(item.url)} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" alt={item.originalName} />
                  ) : (
                    <video src={mediaUrl(item.url)} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" preload="metadata" muted />
                  )}
                  {/* Prioridad: número de orden visible */}
                  <span className="absolute top-2 left-2 bg-primary text-white text-xs font-black px-2.5 py-1 rounded-lg shadow-md tabular-nums">
                    {index + 1}º
                  </span>
                  {/* Badge de tipo */}
                  <span className={`absolute top-2 right-2 text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-widest border shadow-sm ${isImage ? 'bg-accent-blue/90 text-white border-accent-blue' : 'bg-black/70 text-white border-white/20'}`}>
                    {isImage ? 'Imagen' : 'Video'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="font-bold truncate text-sm" title={item.originalName}>{item.originalName}</h4>
                    <p className="text-xs text-text-muted mt-0.5">
                      {isImage ? `Se muestra ${savedImgSeconds} segundos` : 'Reproducción completa'} · Prioridad {index + 1}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => makeFirst(index)}
                      disabled={index === 0}
                      title="Mostrar primero (prioridad 1)"
                      aria-label={`Mostrar ${item.originalName} primero`}
                      className="p-2 rounded-lg text-text-muted hover:text-secondary hover:bg-secondary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <Star size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Mover ${item.originalName} hacia arriba`}
                      className="p-2 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === sorted.length - 1}
                      aria-label={`Mover ${item.originalName} hacia abajo`}
                      className="p-2 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      aria-label={`Eliminar ${item.originalName}`}
                      className="p-2 rounded-lg text-accent-red hover:bg-accent-red/10 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    {/* Configuración de la pantalla */}
      <div className="mt-10 mb-6">
        <h2 className="text-lg font-black flex items-center gap-2">
          <Monitor size={18} className="text-primary" />
          Configuración de la pantalla
        </h2>
        <p className="text-xs text-text-muted mt-1">
          Duración de las imágenes y mensajes del ticker. Todo se aplica en vivo en la pantalla de la sala.
        </p>
      </div>

      {/* Duración configurable de las imágenes en la pantalla de sala */}
      <div className="glass-card mb-8 flex flex-wrap items-center gap-4 p-4">
        <div className="flex items-center gap-2 text-text-main">
          <Clock size={18} className="text-primary" />
          <div>
            <p className="text-sm font-bold leading-tight">Duración de cada imagen en la pantalla</p>
            <p className="text-xs text-text-muted">Se aplica en vivo; los videos reproducen su duración completa.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <input
            type="number"
            min={3}
            max={120}
            value={imgSeconds}
            onChange={e => setImgSeconds(e.target.value)}
            aria-label="Duración de cada imagen en segundos"
            className="input-field w-20 h-10 text-center font-bold"
          />
          <span className="text-sm font-bold text-text-muted">segundos</span>
          <button
            type="button"
            onClick={saveImageDuration}
            disabled={savingConfig || parseInt(imgSeconds, 10) === savedImgSeconds}
            className="btn-primary px-4 py-2.5 text-sm flex items-center gap-2"
          >
            {configSaved ? <Check size={16} /> : savingConfig ? <Loader2 size={16} className="animate-spin" /> : null}
            {configSaved ? 'Guardado' : 'Guardar'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-accent-red/10 border border-accent-red/20 text-accent-red font-semibold">{error}</div>
      )}

      {/* Mensajes del ticker de la pantalla (editables, máx 5 x 160 caracteres) */}
      <div className="glass-card mb-8 flex flex-col gap-4 p-4 lg:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold flex items-center gap-2"><MessageSquareText size={16} className="text-primary" /> Mensajes del ticker de la pantalla</h3>
          <span className="text-xs text-text-muted">Máximo 5 mensajes · 160 caracteres cada uno · se aplican en vivo</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {tickerDraft.map((msg, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-text-muted">
                <span>Mensaje {i + 1}</span>
                <span className={msg.length >= 160 ? 'text-accent-red' : ''}>{msg.length}/160</span>
              </div>
              <input
                type="text"
                value={msg}
                maxLength={160}
                onChange={e => setTickerDraft(prev => prev.map((m, j) => j === i ? e.target.value : m))}
                placeholder={i === 0 ? 'Mensaje principal del ticker…' : 'Mensaje opcional…'}
                aria-label={`Mensaje ${i + 1} del ticker`}
                className="input-field h-10 text-sm"
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={saveTicker}
            disabled={savingTicker || JSON.stringify(tickerDraft.map(m => (m || '').trim())) === JSON.stringify([...savedTicker, '', '', '', '', ''].slice(0, 5).map(m => (m || '').trim()))}
            className="btn-primary px-4 py-2.5 text-sm flex items-center gap-2"
          >
            {tickerSaved ? <Check size={16} /> : savingTicker ? <Loader2 size={16} className="animate-spin" /> : null}
            {tickerSaved ? 'Guardado' : 'Guardar mensajes'}
          </button>
          <span className="text-xs text-text-muted">{savedTicker.length} mensaje{savedTicker.length === 1 ? '' : 's'} activo{savedTicker.length === 1 ? '' : 's'}</span>
        </div>
      </div>

            {/* Modal de subida: arrastrar/soltar o seleccionar archivo */}
      {uploadModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-black/10 rounded-2xl w-full max-w-xl max-h-[90dvh] flex flex-col animate-fade-in shadow-2xl overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold">Agregar contenido a la playlist</h3>
              <button
                type="button"
                onClick={() => { setUploadModalOpen(false); setDragOver(false); }}
                aria-label="Cerrar subida"
                className="p-2 hover:bg-black/5 rounded-lg text-text-muted"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-6 pb-6 flex-1 min-h-0 overflow-y-auto">
              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`relative block border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${dragOver ? 'border-primary bg-primary/[0.07] scale-[1.02]' : 'border-black/15 bg-gray-50 hover:border-primary/40 hover:bg-primary/[0.03]'} ${uploading ? 'pointer-events-none opacity-70' : ''}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/webm,image/jpeg,image/png,image/webp"
                  onChange={handleFileSelected}
                  disabled={uploading}
                  className="sr-only"
                  aria-label="Seleccionar video o imagen"
                />
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-colors ${dragOver ? 'bg-primary text-white' : 'bg-primary/20 text-primary'}`}>
                  {uploading ? <Loader2 size={32} className="animate-spin" /> : <UploadCloud size={32} />}
                </div>
                {uploading ? (
                  <>
                    <h4 className="text-lg font-bold mb-3">Subiendo... {progress}%</h4>
                    <div className="w-full max-w-sm h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-primary transition-all duration-200" style={{ width: `${progress}%` }} />
                    </div>
                  </>
                ) : (
                  <>
                    <h4 className="text-lg font-bold mb-1">
                      {dragOver ? '¡Soltá el archivo acá!' : 'Arrastrá y soltá el archivo'}
                    </h4>
                    <p className="text-text-muted text-sm">o hacé clic para seleccionarlo desde tu equipo</p>
                  </>
                )}
              </label>
              <p className="text-text-muted text-xs mt-4 text-center">
                Videos MP4/WebM (máx. 4 · se comprimen al subir) o imágenes JPG/PNG/WebP (máx. 10 · se convierten a WebP).
                Si un tipo ya está al tope, vas a poder elegir cuál sustituir.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal de sustitución: elegir cuál reemplazar cuando un tipo está al tope */}
      {replaceOptions && replaceFile && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          {/* max-h-[90dvh] + columna con grilla scrolleable: el modal NUNCA
              supera la pantalla, haya 4 videos o 10 imágenes. */}
          <div className="bg-white border border-black/10 rounded-2xl w-full max-w-3xl max-h-[90dvh] flex flex-col animate-fade-in shadow-2xl overflow-hidden">
            <div className="px-6 lg:px-8 pt-6 lg:pt-8 pb-4 shrink-0">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-xl lg:text-2xl font-bold">Límite de {replaceType === 'image' ? '10 imágenes' : '4 videos'} alcanzado</h3>
                <button
                  type="button"
                  onClick={() => { setReplaceOptions(null); setReplaceFile(null); }}
                  aria-label="Cancelar sustitución"
                  className="p-2 hover:bg-black/5 rounded-lg text-text-muted"
                >
                  <X size={20} />
                </button>
              </div>
              <p className="text-text-muted text-xs lg:text-sm mt-1.5">
                «{replaceFile.name}» reemplazará a uno de los {replaceType === 'image' ? 'archivos de imagen' : 'videos'} actuales. Seleccioná cuál querés sustituir (el nuevo toma su lugar en la playlist):
              </p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-6 lg:px-8 pb-6 custom-scrollbar">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {replaceOptions.map(v => (
                  <div key={v.id} className="border border-black/10 rounded-xl overflow-hidden hover:border-primary/40 transition-colors bg-white flex flex-col">
                    <div className="relative h-20 lg:h-24 bg-black/50 shrink-0">
                      {v.type === 'image'
                        ? <img src={mediaUrl(v.url)} className="w-full h-full object-cover" alt={v.originalName} />
                        : <video src={mediaUrl(v.url)} className="w-full h-full object-cover" preload="metadata" muted />}
                    </div>
                    <div className="p-2.5 flex flex-col gap-2 flex-1">
                      <p className="font-bold text-xs truncate" title={v.originalName}>{v.originalName}</p>
                      <button
                        type="button"
                        onClick={() => doUpload(replaceFile, v.id)}
                        disabled={uploading}
                        className="btn-primary w-full mt-auto py-2 text-xs flex items-center justify-center gap-1.5"
                      >
                        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={13} />}
                        Sustituir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaManager;
