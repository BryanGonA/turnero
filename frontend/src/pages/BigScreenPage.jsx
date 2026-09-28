import React, { useState, useEffect, useCallback } from 'react';
import { useSocket } from '../context/SocketContext';
import { getTickets, getVideos, getScreenConfig } from '../services/api';
import { Volume2, Users } from 'lucide-react';

// Duración fija de cada imagen en la pantalla de sala (ms)
const IMAGE_DISPLAY_MS = 12000;

const BigScreenPage = () => {  // Persistente: último turno llamado (se recupera al recargar la página)
  const [calledTicket, setCalledTicket] = useState(null);
  // Solo en el evento de socket: el turno recién llamado que domina la pantalla
  const [flashTicket, setFlashTicket] = useState(null);
  const [allTickets, setAllTickets] = useState([]);
  const [recentCalled, setRecentCalled] = useState([]);
  const [playlist, setPlaylist] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tick, setTick] = useState(0); // re-dispara el timer de imágenes en cada avance
  const [imgSeconds, setImgSeconds] = useState(12); // configurable desde el MediaManager
  const [tickerMessages, setTickerMessages] = useState([
    '🔔 Bienvenido al Consultorio Jurídico. Por favor tome su ticket y espere su turno. 🔔',
    '⚖️ Equidad y transparencia en cada paso. ⚖️',
    '🚀 Impulsando sistemas de gestión de colas eficientes. 🚀'
  ]);
  const socket = useSocket();

  // El héroe se muestra 10 segundos por cada llamado y se reinicia si llaman otro.
  // Solo se dispara con el evento de socket, no al recuperar el estado inicial.
  useEffect(() => {
    if (!flashTicket) return;
    const t = setTimeout(() => setFlashTicket(null), 10000);
    return () => clearTimeout(t);
  }, [flashTicket]);

  // Pre-load voices on component mount
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  const speakTicket = useCallback((ticket) => {
    const backend = `http://${window.location.hostname}:3001`;

    // 1) Campanita: generada por el backend con ffmpeg (offline, sin mixkit)
    try {
      new Audio(`${backend}/api/audio/ding`).play().catch(() => {});
    } catch { /* sin audio disponible */ }

    // 2) Voz: el anuncio del backend (piper, voz neural natural) es la
    //    PRIORIDAD — suena idéntico en todas las pantallas sin importar el
    //    navegador ni las voces del sistema. El TTS nativo del navegador
    //    queda como respaldo solo si el audio del servidor no se reproduce.
    const speakNativeIfPossible = () => {
      if (!('speechSynthesis' in window)) return;
      try {
        // Preferir voces LATAM (mx/419/us/co/ar) por sobre la de España
        const esVoices = window.speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('es'));
        const latam = esVoices.filter(v => /es[-_](mx|419|us|co|ar|cl|pe)/i.test(v.lang));
        const spanishVoices = latam.length > 0 ? latam : esVoices;
        if (spanishVoices.length === 0) return;
        const turnSpelledOut = ticket.turn_number.split('').join(' ');
        const text = `Turno ${turnSpelledOut}, acérquese al módulo ${ticket.area?.name || ''}.`;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'es-MX';
        utterance.rate = 0.85;
        const femaleVoice = spanishVoices.find(v =>
          /female|mujer|monica|paulina|helena|sabina|luciana|google espa|microsoft sabina/i.test(v.name)
        );
        if (femaleVoice) utterance.voice = femaleVoice;
        else utterance.voice = spanishVoices[0];
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      } catch { /* sin TTS disponible */ }
    };

    // Preload durante la campanita: la descarga arranca ya, suena a los 1.5s
    const announce = new Audio(`${backend}/api/audio/announce/${ticket.id}`);
    announce.play().catch((e) => {
      console.warn('[turnero] anuncio no reproducible:', e.name);
      speakNativeIfPossible();
    });
  }, []);

  useEffect(() => {
    fetchInitialData();

    if (socket) {
      socket.on('ticket_called', (ticket) => {
        setCalledTicket(ticket);
        setFlashTicket(ticket);
        setRecentCalled(prev => [ticket, ...prev.slice(0, 4)]);
        speakTicket(ticket); // campanita + voz viven acá

        // Remove from waiting list in state
        setAllTickets(prev => prev.filter(t => t.id !== ticket.id));
      });

      socket.on('ticket_created', (ticket) => {
        setAllTickets(prev => [...prev, ticket]);
      });

      socket.on('ticket_updated', (ticket) => {
        if (ticket.status === 'SERVED' || ticket.status === 'DONE') {
          // If it was the main called ticket, clear it after a delay or if next comes
          setAllTickets(prev => prev.filter(t => t.id !== ticket.id));
        }
      });

      socket.on('video_updated', () => {
        fetchVideos();
      });

      // Config actualizada en vivo desde el gestor de contenido (payload parcial)
      socket.on('screen_config_updated', (cfg) => {
        if (Number.isInteger(cfg?.image_display_seconds) && cfg.image_display_seconds >= 3 && cfg.image_display_seconds <= 120) {
          setImgSeconds(cfg.image_display_seconds);
          setTick(t => t + 1); // reinicia el timer con la nueva duración
        }
        if (Array.isArray(cfg?.ticker_messages)) {
          setTickerMessages(cfg.ticker_messages);
        }
      });
    }

    return () => {
      if (socket) {
        socket.off('ticket_called');
        socket.off('ticket_created');
        socket.off('ticket_updated');
        socket.off('video_updated');
        socket.off('screen_config_updated');
      }
    };
  }, [socket]);

  const fetchInitialData = async () => {
    try {
      const res = await getTickets({ status: 'WAITING' });
      setAllTickets(res.data);

      // Recuperar el último llamado persistente (turno en atención) sin flash
      const callingRes = await getTickets({ status: 'CALLING' });
      const calling = callingRes.data || [];
      if (calling.length > 0) {
        const last = [...calling].sort((a, b) => new Date(b.called_at) - new Date(a.called_at))[0];
        setCalledTicket(last);
      }

      const vidRes = await getVideos();
      setPlaylist(vidRes.data || []);

      // Config de pantalla (endpoint público, con fallbacks): duración + ticker
      try {
        const cfgRes = await getScreenConfig();
        const s = cfgRes.data?.image_display_seconds;
        if (Number.isInteger(s)) setImgSeconds(s);
        if (Array.isArray(cfgRes.data?.ticker_messages) && cfgRes.data.ticker_messages.length > 0) {
          setTickerMessages(cfgRes.data.ticker_messages);
        }
      } catch { /* fallback: 12 s + mensajes por defecto */ }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchVideos = async () => {
    try {
      const vidRes = await getVideos();
      setPlaylist(vidRes.data || []);

      // Config de pantalla (endpoint público, con fallbacks): duración + ticker
      try {
        const cfgRes = await getScreenConfig();
        const s = cfgRes.data?.image_display_seconds;
        if (Number.isInteger(s)) setImgSeconds(s);
        if (Array.isArray(cfgRes.data?.ticker_messages) && cfgRes.data.ticker_messages.length > 0) {
          setTickerMessages(cfgRes.data.ticker_messages);
        }
      } catch { /* fallback: 12 s + mensajes por defecto */ }
      setCurrentIndex(0);
    } catch (err) {
      console.error(err);
    }
  };

  // Playlist mixta: el archivo en curso (video o imagen) y su avance
  const current = playlist[currentIndex];

  // Avanza la playlist en ciclo. El tick garantiza que el timer de las imágenes
  // se reinicie en cada avance, incluso si el siguiente item repite el actual.
  const advance = useCallback(() => {
    setTick(t => t + 1);
    setCurrentIndex(prev => (playlist.length > 0 ? (prev + 1) % playlist.length : 0));
  }, [playlist.length]);

  // Las imágenes no tienen "onEnded": avanzan solas a los 12 segundos.
  // La barra de progreso visible hace tangible ese tiempo de duración.
  useEffect(() => {
    if (!current || current.type !== 'image' || playlist.length === 0) return;
    const t = setTimeout(advance, imgSeconds * 1000);
    return () => clearTimeout(t);
  }, [tick, current?.id, advance, imgSeconds]);

  return (
    <div className="shrink-0 h-[calc(100dvh-7.25rem)] p-0 overflow-hidden flex flex-col bg-white">
      {/* El Top Banner original se ha borrado a favor del Header Global en App.jsx */}

      <main className="flex-1 min-h-0 grid grid-cols-12 gap-0">
        {/* Left Side - Video o panel de bienvenida (signage oscuro) */}
        <div className="col-span-8 flex flex-col items-center justify-center border-r border-black/10 relative overflow-hidden">
          {/* Main Content: playlist mixta (videos e imágenes) en ciclo */}
          <div className="absolute inset-0 z-0 flex items-center justify-center">
            {playlist.length > 0 && current ? (
              current.type === 'image' ? (
                <img
                  key={current.id}
                  src={`http://${window.location.hostname}:3001${current.url}`}
                  className="w-[95%] h-[95%] object-cover rounded-2xl shadow-2xl"
                  alt={current.originalName}
                />
              ) : (
                <video
                  key={current.id}
                  src={`http://${window.location.hostname}:3001${current.url}`}
                  className="w-[95%] h-[95%] object-cover opacity-80 rounded-2xl shadow-2xl"
                  autoPlay
                  muted
                  playsInline
                  onEnded={advance}
                  onError={advance}
                />
              )
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-white via-[#f8fafc] to-[#eef2f7]">
                <div className="text-center px-12 animate-fade-in">
                  <Volume2 size={72} className="mx-auto mb-8 text-black/15" />
                  <p className="text-text-muted text-lg font-medium uppercase tracking-[0.35em] mb-4">Bienvenidos al</p>
                  <h2 className="text-text-main text-5xl xl:text-6xl font-black mb-10">Consultorio Jurídico</h2>
                  <div className="inline-flex items-baseline gap-4 bg-white border border-black/10 rounded-2xl px-8 py-5 shadow-sm">
                    <span className="text-text-muted text-sm font-bold uppercase tracking-widest">En espera</span>
                    <span className="text-primary text-5xl font-black tabular-nums">{allTickets.length}</span>
                    <span className="text-text-muted text-sm font-bold uppercase tracking-widest">turnos</span>
                  </div>
                  <p className="text-text-muted text-sm mt-10 italic">Tome su turno en el kiosco y espere su llamado</p>
                </div>
              </div>
            )}
          </div>
          {/* Duración visible de la imagen: barra de progreso de 12 s */}
          {current?.type === 'image' && playlist.length > 0 && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 w-72">
              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden shadow-lg">
                <div
                  key={`${tick}-${current.id}`}
                  className="h-full bg-white rounded-full"
                  style={{ animation: `img-duration ${imgSeconds}s linear forwards` }}
                />
              </div>
              <p className="text-center text-white/60 text-xs font-bold uppercase tracking-widest mt-2">
                Imagen · {imgSeconds} s
              </p>
            </div>
          )}

          {/* HÉROE: turno recién llamado domina la pantalla ~10s (patrón turnero) */}
          {flashTicket && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-gradient-to-br from-primary to-primary-hover animate-fade-in">
              <div className="text-center animate-hero-pulse px-6">
                <span className="inline-block bg-white text-primary px-10 py-3 rounded-full text-lg xl:text-2xl font-black uppercase tracking-[0.35em] mb-8 shadow-2xl">
                  Ahora atendiendo
                </span>
                {flashTicket.is_priority && (
                  <span className="block text-secondary text-xl xl:text-3xl font-black uppercase tracking-[0.3em] mb-4">
                    ★ Prioritaria ★
                  </span>
                )}
                <h2 className="text-white text-[clamp(5rem,16vw,12rem)] font-black leading-none tabular-nums drop-shadow-lg">
                  {flashTicket.turn_number}
                </h2>
                <p className="mt-8 text-white/90 text-lg xl:text-2xl font-medium uppercase tracking-[0.3em]">
                  Acérquese al módulo
                </p>
                <p className="mt-2 text-white text-4xl xl:text-6xl font-black">
                  {flashTicket.area?.name}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Side - Estado de la jornada (signage oscuro) */}
        <div className="col-span-4 bg-[#f8fafc] min-h-0 flex flex-col p-8 gap-6 overflow-hidden">

          {/* Último llamado (persistente: sobrevive a recargas) */}
          {calledTicket ? (
            <div className="text-center bg-white border border-black/10 rounded-2xl p-6 shadow-xl relative overflow-hidden shrink-0">
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary to-secondary"></div>
              <div className="inline-block px-6 py-1.5 bg-primary text-white rounded-full text-xs font-black uppercase tracking-[0.3em] mb-4 shadow-md">
                Último llamado
              </div>
              <h2 className="text-[3rem] xl:text-[4rem] 2xl:text-[5rem] font-black leading-none text-primary tabular-nums">
                {calledTicket.turn_number}
              </h2>
              <p className="text-text-muted text-xs font-bold uppercase tracking-widest mt-3">
                {calledTicket.area?.name}
              </p>
            </div>
          ) : (
            <div className="text-center border-2 border-dashed border-black/15 rounded-2xl flex flex-col items-center justify-center p-10 shrink-0">
              <Volume2 size={40} className="text-black/20 mb-4" />
              <p className="text-text-muted font-bold tracking-widest uppercase text-xs">Esperando llamado...</p>
            </div>
          )}

          {/* En cola — en COLUMNA bajo el último llamado. Filas flexibles:
              se reparten el alto disponible y jamás generan scroll. */}
          <div className="flex-1 min-h-0 flex flex-col">
            <h3 className="text-xl font-bold mb-3 flex items-center gap-3 text-text-main shrink-0">
              <Users size={20} className="text-primary" />
              En cola
              <span className="ml-auto bg-primary text-white text-sm font-black px-3 py-1 rounded-full tabular-nums">
                {allTickets.length}
              </span>
            </h3>
            <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
              {allTickets.slice(0, 5).map((ticket) => (
                <div key={ticket.id} className={`flex-1 min-h-0 min-h-[2.5rem] max-h-16 rounded-xl px-5 flex items-center justify-between gap-3 shadow-sm border ${ticket.is_priority ? 'bg-secondary/10 border-secondary/50' : 'bg-white border-black/10'}`}>
                  <span className="font-mono text-xl xl:text-2xl font-black text-slate-700 tracking-wide tabular-nums">
                    {ticket.is_priority && <span className="text-secondary mr-1.5" aria-label="prioritario">★</span>}
                    {ticket.turn_number}
                  </span>
                  <span className="text-[11px] font-bold text-text-muted uppercase tracking-widest text-right truncate max-w-[45%]">
                    {ticket.area?.name}
                  </span>
                </div>
              ))}
              {allTickets.length > 5 && (
                <p className="text-sm text-text-muted text-center shrink-0">+{allTickets.length - 5} más en espera</p>
              )}
            </div>
          </div>

          {/* Turnos anteriores — anclado al fondo; solo 2xl+ (info secundaria) */}
          <div className="mt-auto hidden 2xl:block">
              <h3 className="text-lg font-bold mb-3 flex items-center gap-3 border-b border-black/10 pb-2 text-text-main shrink-0">
                <span className="w-1.5 h-6 bg-accent-blue rounded-full"></span>
                Turnos anteriores
              </h3>
              <div className="flex flex-col gap-2">
                {recentCalled.slice(1, 3).map((ticket, idx) => (
                  <div key={ticket.id} className="bg-white border border-black/10 rounded-lg px-4 py-2.5 flex justify-between items-center gap-3 shadow-sm animate-fade-in" style={{ animationDelay: `${idx * 100}ms` }}>
                    <span className="text-lg xl:text-xl font-black text-slate-500 tabular-nums">{ticket.turn_number}</span>
                    <p className="text-primary font-bold text-xs truncate max-w-[50%]">{ticket.area?.name}</p>
                  </div>
                ))}
                {recentCalled.length <= 1 && (
                  <p className="text-text-muted text-center py-6 italic text-sm">Aún no hay llamados</p>
                )}
              </div>
          </div>

        </div>
      </main>

      {/* Footer / Ticker: mensajes editables desde el gestor (máx 5 x 160).
          Se duplican para que el loop translateX(-50%) sea perfecto. */}
      {tickerMessages.length > 0 && (
        <footer className="bg-white border-t border-black/10 p-4 shrink-0">
          <div className="flex overflow-hidden whitespace-nowrap">
            <div className="animate-marquee flex gap-20">
              {[...tickerMessages, ...tickerMessages].map((msg, i) => (
                <span key={i} className="text-lg font-medium text-text-muted">
                  {msg}
                </span>
              ))}
            </div>
          </div>
        </footer>
      )}


    </div>
  );
};

export default BigScreenPage;
