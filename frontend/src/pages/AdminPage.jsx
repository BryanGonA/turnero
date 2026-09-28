import React, { useState, useEffect } from 'react';
import { getAreas, getTickets, getUsers, createUser, updateUser, deleteUser, createArea, updateArea } from '../services/api';
import { Settings, Users, Layout, Database, Plus, Edit2, Trash2, Search, ExternalLink, LogOut, Monitor, FileText, ListOrdered } from 'lucide-react';
import ReportsSection from '../components/ReportsSection';
import LogsSection from '../components/LogsSection';
import ParamsSection from '../components/ParamsSection';
import QueueSection from '../components/QueueSection';
import MediaManager from '../components/MediaManager';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';

// Búsqueda context-aware: placeholder por tab. Tabs sin tabla no muestran buscador.
const SEARCH_PLACEHOLDERS = {
  users: 'Buscar usuario o documento...',
  areas: 'Buscar área o prefijo...',
  videos: 'Buscar video...',
  queue: 'Buscar turno o documento...',
  logs: 'Buscar en el registro...',
};

const AdminPage = () => {
  const [activeTab, setActiveTab] = useState('queue');
  const [searchQuery, setSearchQuery] = useState('');
  const socket = useSocket();
  const [connected, setConnected] = useState(false);
  const [data, setData] = useState({ users: [], areas: [], parameters: [], videos: [] });
  const [loading, setLoading] = useState(true);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', id_number: '', role: 'ADVISOR', password: '', area_id: '', advisor_profile: 'PRINCIPAL' });
  const [editUser, setEditUser] = useState(null);
  const [isAddAreaOpen, setIsAddAreaOpen] = useState(false);
  const [newArea, setNewArea] = useState({ name: '', id_prefix: '', is_public: true });
  const [editArea, setEditArea] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || user.role !== 'ADMIN') {
      navigate('/login');
      return;
    }
    fetchData();
  }, [navigate]);

  // Estado real del sistema: el socket ES la capa en tiempo real del dashboard.
  // Antes este indicador estaba hardcodeado en "Conectado" aunque el backend cayera.
  useEffect(() => {
    if (!socket) return;
    setConnected(socket.connected);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const areasRes = await getAreas();
      const usersRes = await getUsers();
      setData(prev => ({ ...prev, areas: areasRes.data, users: usersRes.data }));
      setLoading(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await createUser(newUser);
      setIsAddUserOpen(false);
      setNewUser({ name: '', id_number: '', role: 'ADVISOR', password: '', area_id: '', advisor_profile: 'PRINCIPAL' });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear usuario');
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await updateUser(editUser.id, {
        name: editUser.name,
        id_number: editUser.id_number,
        role: editUser.role,
        password: editUser.password || undefined,
        area_id: editUser.area_id,
        advisor_profile: editUser.advisor_profile
      });
      setEditUser(null);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al actualizar usuario');
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm("¿Está seguro de borrar este usuario? Esta acción no se puede deshacer.")) return;
    try {
      await deleteUser(id);
      fetchData();
    } catch (err) {
      setError('Error al borrar el usuario');
    }
  };

  const handleAddArea = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await createArea(newArea);
      setIsAddAreaOpen(false);
      setNewArea({ name: '', id_prefix: '', is_public: true });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear area');
    }
  };

  const handleUpdateArea = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await updateArea(editArea.id, { name: editArea.name, id_prefix: editArea.id_prefix, is_public: editArea.is_public });
      setEditArea(null);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al actualizar el área');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  // Filtros de búsqueda context-aware sobre el tab activo
  const q = searchQuery.trim().toLowerCase();
  const matches = (...fields) => fields.some(f => String(f || '').toLowerCase().includes(q));
  const filteredUsers = q ? data.users.filter(u => matches(u.name, u.id_number, u.role, u.advisor_profile, u.area?.name)) : data.users;
  const filteredAreas = q ? data.areas.filter(a => matches(a.name, a.id_prefix)) : data.areas;
  const filteredVideos = q ? data.videos.filter(v => matches(v.originalName)) : data.videos;
  const searchable = !!SEARCH_PLACEHOLDERS[activeTab];

  const tabs = [
    { id: 'queue', label: 'Cola del Día', icon: ListOrdered },
    { id: 'users', label: 'Administrador de Usuarios', icon: Users },
    { id: 'areas', label: 'Configuración de Areas', icon: Layout },
    { id: 'videos', label: 'Contenido de Pantalla', icon: Monitor },
    { id: 'reports', label: 'Reportes y Analiticas', icon: FileText },
    { id: 'params', label: 'Parametros del Sistema', icon: Settings },
    { id: 'logs', label: 'Registro de Actividad', icon: Database },
  ];

  return (
    <div className="flex-1 md:flex-none flex flex-col md:flex-row min-w-0 md:h-[calc(100dvh-7.25rem)]">
      {/* Sidebar: columna en escritorio, barra horizontal con scroll en móvil */}
      <aside className="sidebar-dark w-full md:w-72 flex md:flex-col p-4 md:p-6 md:shrink-0 md:h-full md:overflow-y-auto custom-scrollbar">
        <div className="hidden md:flex items-center gap-3 mb-8 px-2">
          <div className="w-11 h-11 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/40">
            <Settings className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white leading-none">Turnero</h1>
            <p className="nav-label mt-1">Consultorio Jurídico</p>
          </div>
        </div>

        <p className="nav-label hidden md:block px-2 mb-2">Módulos</p>
        <nav className="flex md:flex-col gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSearchQuery(''); }}
              className={`nav-item shrink-0 ${activeTab === tab.id ? 'active' : ''}`}
            >
              <tab.icon size={19} />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto flex-col gap-4 hidden md:flex pt-6">
          <div className="px-4 py-4 bg-white/[0.06] rounded-2xl border border-white/10">
            <p className="nav-label mb-2">Estado del sistema</p>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full animate-pulse ${connected ? 'bg-accent-green' : 'bg-accent-red'}`}></div>
              <span className="text-sm font-medium text-white/90">
                {connected ? 'Conectado' : socket ? 'Sin conexión' : 'Conectando...'}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="nav-item w-full hover:!text-accent-red"
          >
            <LogOut size={19} />
            <span>Cerrar Sesión</span>
          </button>
        </div>

        {/* Cerrar sesión visible en móvil */}
        <button
          onClick={handleLogout}
          className="md:hidden ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-white/70 hover:text-accent-red shrink-0 self-center"
        >
          <LogOut size={18} />
          <span className="font-semibold text-sm">Salir</span>
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 p-4 md:p-10 overflow-y-auto overflow-x-hidden">
        <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 md:mb-10">
          <div>
            <h2 className="text-3xl font-bold">{tabs.find(t => t.id === activeTab).label}</h2>
            <p className="text-text-muted mt-1">Administra y monitorea los componentes de tu sistema</p>
          </div>
          <div className="flex gap-4">
            {searchable && (
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={SEARCH_PLACEHOLDERS[activeTab]}
                  aria-label="Buscar en la tabla"
                  className="input-field pl-12 h-11 w-64 bg-white"
                />
              </div>
            )}
            <button
              onClick={() => {
                if (activeTab === 'users') setIsAddUserOpen(true);
                if (activeTab === 'areas') setIsAddAreaOpen(true);
              }}
              className={`btn-primary flex items-center gap-2 px-6 ${['videos', 'params', 'logs', 'queue', 'reports'].includes(activeTab) ? 'hidden' : ''}`}
            >
              <Plus size={24} />
              Nuevo {activeTab === 'users' ? 'Usuario' : 'Área'}
            </button>
          </div>
        </header>

        {activeTab === 'areas' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-fade-in">
            {filteredAreas.length === 0 && (
              <div className="col-span-full text-center py-16 text-text-muted font-semibold bg-gray-50 rounded-2xl border border-black/10">
                Sin resultados para “{searchQuery}”
              </div>
            )}
            {filteredAreas.map(area => (
              <div key={area.id} className="glass-card hover:border-primary/40 group p-6">
                <div className="flex justify-between items-start mb-6">
                  <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                    <Layout size={24} />
                  </div>
                  <div className="flex gap-2 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button onClick={() => setEditArea(area)} aria-label={`Editar área ${area.name}`} className="p-2 hover:bg-primary/10 rounded-lg text-text-muted hover:text-primary transition-colors">
                      <Edit2 size={16} />
                    </button>
                  </div>
                </div>
                <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                  {area.name}
                  {!area.is_public && <span className="text-[10px] bg-accent-red/20 text-accent-red px-2 py-1 rounded-full uppercase tracking-widest border border-accent-red/30">Oculta</span>}
                </h3>
                <div className="mt-4">
                  <span className="text-xs text-text-muted uppercase font-bold">Prefijo de turno</span>
                  <span className="block text-2xl font-mono font-bold text-primary mt-1">{area.id_prefix}</span>
                </div>
                <button onClick={() => setActiveTab('queue')} className="w-full mt-6 py-3 bg-gray-50 hover:bg-primary/5 border border-black/10 hover:border-primary/40 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors">
                  <ExternalLink size={14} />
                  Ver Tablero
                </button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'users' && (
          <div className="glass-card p-0 overflow-hidden animate-fade-in">
            <table className="data-table">
              <thead>
                <tr className="bg-gray-50 text-text-muted text-xs uppercase tracking-widest font-black border-b border-black/5">
                  <th className="px-6 py-4">Usuario</th>
                  <th className="px-6 py-4">Rol</th>
                  <th className="px-6 py-4">Area</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filteredUsers.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-16 text-center text-text-muted">Sin resultados para “{searchQuery}”</td></tr>
                )}
                {filteredUsers.map(u => (
                  <tr key={u.id} className="hover:bg-primary/[0.03] group transition-colors">
                    <td className="px-6 py-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-secondary"></div>
                        <div>
                          <p className="font-bold">{u.name}</p>
                          <p className="text-xs text-text-muted">ID: {u.id_number}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-6">
                      <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-bold rounded-lg uppercase">{u.role}</span>
                      {u.role === 'ADVISOR' && (
                        <span className="ml-2 px-3 py-1 bg-secondary/10 text-secondary text-xs font-bold rounded-lg uppercase">{u.advisor_profile}</span>
                      )}
                    </td>
                    <td className="px-6 py-6 text-sm text-text-muted">{u.area?.name || 'General Area'}</td>
                    <td className="px-6 py-6 text-right">
                      <div className="flex justify-end gap-2 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button onClick={() => setEditUser({ ...u, password: '' })} aria-label={`Editar usuario ${u.name}`} className="p-2 hover:bg-primary/10 rounded-lg text-text-muted hover:text-primary"><Edit2 size={16} /></button>
                        <button onClick={() => handleDeleteUser(u.id)} aria-label={`Eliminar usuario ${u.name}`} className="p-2 hover:bg-accent-red/10 rounded-lg text-accent-red"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'videos' && (
          <MediaManager />
        )}

        {activeTab === 'reports' && (
          <ReportsSection data={data} />
        )}

        {activeTab === 'queue' && (
          <QueueSection searchQuery={searchQuery} />
        )}

        {activeTab === 'logs' && (
          <LogsSection searchQuery={searchQuery} />
        )}

        {activeTab === 'params' && (
          <ParamsSection />
        )}

        {isAddUserOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white border border-black/10 rounded-2xl p-8 w-full max-w-md animate-fade-in shadow-2xl">
              <h3 className="text-2xl font-bold mb-6">Nuevo Usuario</h3>
              {error && <div className="mb-4 text-accent-red text-sm font-semibold">{error}</div>}
              <form onSubmit={handleAddUser} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Nombre</label>
                  <input required value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} type="text" className="input-field w-full" placeholder="John Doe" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">ID Number</label>
                  <input required value={newUser.id_number} onChange={e => setNewUser({ ...newUser, id_number: e.target.value })} type="text" className="input-field w-full" placeholder="ID or Username" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Password</label>
                  <input required value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} type="password" className="input-field w-full" placeholder="Default Password" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Role</label>
                  <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })} className="input-field w-full">
                    <option value="ADVISOR">Asesor</option>
                    <option value="ADMIN">Admin</option>
                    <option value="REQUESTER">Solicitante</option>
                    <option value="MARKETING">Marketing (Contenido de pantalla)</option>
                  </select>
                </div>
                {newUser.role === 'ADVISOR' && (
                  <div>
                    <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Perfil Asesor</label>
                    <select value={newUser.advisor_profile} onChange={e => setNewUser({ ...newUser, advisor_profile: e.target.value })} className="input-field w-full">
                      <option value="PRINCIPAL">Principal</option>
                      <option value="SUPLENTE">Suplente</option>
                    </select>
                  </div>
                )}
                {(newUser.role === 'ADVISOR' || newUser.role === 'REQUESTER') && (
                  <div>
                    <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Area</label>
                    <select value={newUser.area_id} onChange={e => setNewUser({ ...newUser, area_id: e.target.value })} className="input-field w-full">
                      <option value="">Seleccione Area...</option>
                      {data.areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="flex gap-4 mt-6">
                  <button type="button" onClick={() => setIsAddUserOpen(false)} className="px-6 py-3 w-full bg-white border border-black/10 hover:bg-gray-50 rounded-xl font-bold transition-colors">Cancelar</button>
                  <button type="submit" className="btn-primary w-full">Crear Usuario</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {editUser && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white border border-black/10 rounded-2xl p-8 w-full max-w-md animate-fade-in shadow-2xl">
              <h3 className="text-2xl font-bold mb-6">Editar Usuario</h3>
              {error && <div className="mb-4 text-accent-red text-sm font-semibold">{error}</div>}
              <form onSubmit={handleUpdateUser} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Nombre</label>
                  <input required value={editUser.name} onChange={e => setEditUser({ ...editUser, name: e.target.value })} type="text" className="input-field w-full" placeholder="John Doe" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">ID Number</label>
                  <input required value={editUser.id_number} onChange={e => setEditUser({ ...editUser, id_number: e.target.value })} type="text" className="input-field w-full" placeholder="ID or Username" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Password (Dejar en blanco para no cambiar)</label>
                  <input value={editUser.password || ''} onChange={e => setEditUser({ ...editUser, password: e.target.value })} type="password" className="input-field w-full" placeholder="Nueva Contraseña" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Role</label>
                  <select value={editUser.role} onChange={e => setEditUser({ ...editUser, role: e.target.value })} className="input-field w-full">
                    <option value="ADVISOR">Asesor</option>
                    <option value="ADMIN">Admin</option>
                    <option value="REQUESTER">Solicitante</option>
                    <option value="MARKETING">Marketing (Contenido de pantalla)</option>
                  </select>
                </div>
                {editUser.role === 'ADVISOR' && (
                  <div>
                    <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Perfil Asesor</label>
                    <select value={editUser.advisor_profile || 'PRINCIPAL'} onChange={e => setEditUser({ ...editUser, advisor_profile: e.target.value })} className="input-field w-full">
                      <option value="PRINCIPAL">Principal</option>
                      <option value="SUPLENTE">Suplente</option>
                    </select>
                  </div>
                )}
                {(editUser.role === 'ADVISOR' || editUser.role === 'REQUESTER') && (
                  <div>
                    <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Area</label>
                    <select value={editUser.area_id || ''} onChange={e => setEditUser({ ...editUser, area_id: e.target.value })} className="input-field w-full">
                      <option value="">Seleccione Area...</option>
                      {data.areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="flex gap-4 mt-6">
                  <button type="button" onClick={() => { setEditUser(null); setError(null); }} className="px-6 py-3 w-full bg-white border border-black/10 hover:bg-gray-50 rounded-xl font-bold transition-colors">Cancelar</button>
                  <button type="submit" className="btn-primary w-full">Actualizar Usuario</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isAddAreaOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white border border-black/10 rounded-2xl p-8 w-full max-w-md animate-fade-in shadow-2xl">
              <h3 className="text-2xl font-bold mb-6">Nueva Área</h3>
              {error && <div className="mb-4 text-accent-red text-sm font-semibold">{error}</div>}
              <form onSubmit={handleAddArea} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Area Name</label>
                  <input required value={newArea.name} onChange={e => setNewArea({ ...newArea, name: e.target.value })} type="text" className="input-field w-full" placeholder="e.g. Consultations" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Prefijo de Turno (e.g. A, CON)</label>
                  <input required value={newArea.id_prefix} onChange={e => setNewArea({ ...newArea, id_prefix: e.target.value })} type="text" className="input-field w-full" placeholder="e.g. CON" maxLength={5} />
                </div>
                <div className="flex items-center gap-3 mt-2 p-3 bg-gray-50 rounded-xl border border-black/10">
                  <input
                    type="checkbox"
                    id="new_is_public"
                    checked={newArea.is_public}
                    onChange={e => setNewArea({ ...newArea, is_public: e.target.checked })}
                    className="w-5 h-5 accent-primary cursor-pointer"
                  />
                  <label htmlFor="new_is_public" className="text-sm font-semibold cursor-pointer">Visible para Clientes (Terminal de Turnos)</label>
                </div>
                <div className="flex gap-4 mt-6">
                  <button type="button" onClick={() => setIsAddAreaOpen(false)} className="px-6 py-3 w-full bg-white border border-black/10 hover:bg-gray-50 rounded-xl font-bold transition-colors">Cancelar</button>
                  <button type="submit" className="btn-primary w-full">Crear Area</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {editArea && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white border border-black/10 rounded-2xl p-8 w-full max-w-md animate-fade-in shadow-2xl">
              <h3 className="text-2xl font-bold mb-6">Editar Área</h3>
              {error && <div className="mb-4 text-accent-red text-sm font-semibold">{error}</div>}
              <form onSubmit={handleUpdateArea} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Area Name</label>
                  <input required value={editArea.name} onChange={e => setEditArea({ ...editArea, name: e.target.value })} type="text" className="input-field w-full" placeholder="e.g. Consultations" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Prefijo de Turno (e.g. A, CON)</label>
                  <input required value={editArea.id_prefix} onChange={e => setEditArea({ ...editArea, id_prefix: e.target.value })} type="text" className="input-field w-full" placeholder="e.g. CON" maxLength={5} />
                </div>
                <div className="flex items-center gap-3 mt-2 p-3 bg-gray-50 rounded-xl border border-black/10">
                  <input
                    type="checkbox"
                    id="edit_is_public"
                    checked={editArea.is_public ?? true}
                    onChange={e => setEditArea({ ...editArea, is_public: e.target.checked })}
                    className="w-5 h-5 accent-primary cursor-pointer"
                  />
                  <label htmlFor="edit_is_public" className="text-sm font-semibold cursor-pointer">Visible para Clientes (Terminal de Turnos)</label>
                </div>
                <div className="flex gap-4 mt-6">
                  <button type="button" onClick={() => { setEditArea(null); setError(null); }} className="px-6 py-3 w-full bg-white border border-black/10 hover:bg-gray-50 rounded-xl font-bold transition-colors">Cancelar</button>
                  <button type="submit" className="btn-primary w-full">Actualizar Área</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminPage;
