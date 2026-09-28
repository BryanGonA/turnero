import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import MediaManager from '../components/MediaManager';
import { Monitor, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const MarketingPage = () => {
  const [user, setUser] = useState(null);
  const socket = useSocket();
  const navigate = useNavigate();

  useEffect(() => {
    let savedUser = null;
    try {
      savedUser = JSON.parse(localStorage.getItem('user'));
    } catch {
      savedUser = null;
    }
    if (!savedUser || (savedUser.role !== 'MARKETING' && savedUser.role !== 'ADMIN')) {
      navigate('/login');
      return;
    }
    setUser(savedUser);
  }, [navigate]);

  // MediaManager escucha 'video_updated' por su cuenta; el socket del provider
  // es el mismo que usa la pantalla de sala para refrescar su playlist.

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  if (!user) return null;

  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto animate-fade-in">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Monitor size={28} className="text-primary" />
            Contenido de Pantalla
          </h1>
          <p className="text-text-muted">
            Playlist, duración de imágenes y mensajes del ticker de la sala — <span className="text-primary font-semibold">{user.name}</span>
          </p>
        </div>
        <button onClick={logout} className="flex items-center gap-2 text-text-muted hover:text-accent-red transition-colors bg-white border border-black/10 px-4 py-2 rounded-xl text-sm font-semibold hover:border-accent-red/30 hover:bg-accent-red/10">
          <LogOut size={18} />
          Cerrar Sesión
        </button>
      </div>

      <MediaManager />
    </div>
  );
};

export default MarketingPage;
