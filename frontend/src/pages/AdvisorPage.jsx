import React, { useState, useEffect } from 'react';
import { getTickets, updateTicket, changePassword, assignTicket, getSuplentes } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { Play, Check, XCircle, Users, Bell, LogOut, ChevronRight, Key } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AdvisorPage = () => {
  const [waitingTickets, setWaitingTickets] = useState([]);
  const [currentTicket, setCurrentTicket] = useState(null);
  const [user, setUser] = useState(null);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);
  const [suplentes, setSuplentes] = useState([]);
  const [selectedSuplente, setSelectedSuplente] = useState('');
  const socket = useSocket();
  const navigate = useNavigate();

  useEffect(() => {
    const savedUser = JSON.parse(localStorage.getItem('user'));
    if (!savedUser) {
      navigate('/login');
      return;
    }
    setUser(savedUser);

    if (savedUser.requires_password_change) {
      setIsChangePasswordOpen(true);
    }

    fetchTickets(savedUser);

    if (savedUser.advisor_profile === 'PRINCIPAL') {
      getSuplentes().then(res => {
        setSuplentes(res.data);
      }).catch(err => console.error(err));
    }

    if (socket) {
      socket.on('ticket_created', (ticket) => {
        if (ticket.area_id === savedUser.area_id && savedUser.advisor_profile === 'PRINCIPAL') {
          setWaitingTickets(prev => prev.some(t => t.id === ticket.id) ? prev : [...prev, ticket]);
        }
      });

      // Alguien llamó un turno: todos lo retiran de su lista
      socket.on('ticket_called', (ticket) => {
        setWaitingTickets(prev => prev.filter(t => t.id !== ticket.id));
      });

      socket.on('ticket_updated', (ticket) => {
        if (ticket.status === 'WAITING') {
          // Turno asignado/transferido: me aparece si es mío, desaparece si ya no lo es
          setWaitingTickets(prev => {
            const mine = ticket.advisor_id === savedUser.id;
            const exists = prev.some(t => t.id === ticket.id);
            if (mine && !exists) return [...prev, ticket].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            if (!mine && exists) return prev.filter(t => t.id !== ticket.id);
            return prev;
          });
        } else {
          // SERVED / DONE / UNSERVED: fuera de la cola de todos
          setWaitingTickets(prev => prev.filter(t => t.id !== ticket.id));
        }
      });

      // Respaldo ante reconexiones o suspensión de equipos en la LAN
      socket.on('connect', () => fetchTickets(savedUser));
    }

    return () => {
      if (socket) {
        socket.off('ticket_created');
        socket.off('ticket_called');
        socket.off('ticket_updated');
        socket.off('connect');
      }
    };
  }, [socket, navigate]);

  const fetchTickets = async (usr) => {
    try {
      const res = await getTickets({
        area_id: usr.area_id,
        status: 'WAITING',
        advisor_profile: usr.advisor_profile,
        advisor_id: usr.id
      });
      setWaitingTickets(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCallNext = async () => {
    if (waitingTickets.length === 0) return;
    const nextTicket = waitingTickets[0];
    try {
      const res = await updateTicket(nextTicket.id, { status: 'CALLING' });
      setCurrentTicket(res.data);
      setWaitingTickets(prev => prev.filter(t => t.id !== nextTicket.id));
    } catch (err) {
      if (err.response?.status === 409) {
        // Otro asesor lo tomó justo antes: refresco la cola y aviso
        fetchTickets(user);
        window.alert('Ese turno acaba de ser tomado por otro asesor.');
      } else {
        console.error(err);
      }
    }
  };

  const handleUpdateStatus = async (status) => {
    if (!currentTicket) return;
    try {
      await updateTicket(currentTicket.id, { status });
      setCurrentTicket(null);
    } catch (err) {
      if (err.response?.status === 409) {
        window.alert('El turno ya no está bajo tu atención.');
        setCurrentTicket(null);
      } else {
        console.error(err);
      }
    }
  };

  const handleRecall = async () => {
    if (!currentTicket) return;
    try {
      await updateTicket(currentTicket.id, { status: 'CALLING' });
    } catch (err) {
      console.error(err);
    }
  };

  const handleAssign = async () => {
    if (!currentTicket || !selectedSuplente) return;
    if (!window.confirm("¿Asignar este turno al suplente seleccionado?")) return;
    try {
      await assignTicket(currentTicket.id, selectedSuplente);
      setCurrentTicket(null);
      setSelectedSuplente('');
    } catch (err) {
      window.alert(err.response?.data?.error || 'No se pudo transferir el turno');
    }
  };

  const submitChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError('Las contraseñas nuevas no coinciden');
      return;
    }

    setIsPasswordLoading(true);

    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword
      });
      setPasswordSuccess(true);

      const updatedUser = { ...user, requires_password_change: false };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);

      setTimeout(() => {
        setIsChangePasswordOpen(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPasswordSuccess(false);
      }, 1500);
    } catch (err) {
      setPasswordError(err.response?.data?.error || 'Error cambiando la contraseña');
    } finally {
      setIsPasswordLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  if (!user) return null;

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto animate-fade-in">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-3xl font-bold">Panel Asesor</h1>
          <p className="text-text-muted"> <span className="text-primary font-semibold">{user.name}</span></p>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setIsChangePasswordOpen(true)} className="flex items-center gap-2 text-text-muted hover:text-primary transition-colors bg-white border border-black/10 px-4 py-2 rounded-xl text-sm font-semibold hover:border-primary/40 hover:bg-primary/[0.03]">
            <Key size={18} />
            Cambiar Contraseña
          </button>
          <button onClick={logout} className="flex items-center gap-2 text-text-muted hover:text-accent-red transition-colors bg-white border border-black/10 px-4 py-2 rounded-xl text-sm font-semibold hover:border-accent-red/30 hover:bg-accent-red/10">
            <LogOut size={18} />
            Cerrar Sesión
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Current Ticket Panel */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="glass-card relative overflow-hidden h-full flex flex-col justify-center items-center text-center p-12">
            <div className="absolute top-0 right-0 p-4">
              <span className={`px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${currentTicket ? 'bg-accent-blue/20 text-accent-blue' : 'bg-gray-100 text-text-muted'}`}>
                {currentTicket ? 'Turno en atención' : 'Sin turno en atención'}
              </span>
            </div>

            {currentTicket ? (
              <div className="animate-fade-in w-full">
                <span className="text-text-muted uppercase tracking-[0.2em] text-sm">Asesorando a:</span>
                <h2 className="text-6xl md:text-8xl font-black text-primary mt-4 mb-2 break-all">{currentTicket.turn_number}</h2>
                <div className="flex items-center justify-center gap-2 text-text-muted mb-10">
                  <Users size={16} />
                  <span>ID: {currentTicket.requester_id_number}</span>
                </div>

                <div className="grid grid-cols-2 gap-4 max-w-md mx-auto mb-6">
                  <button
                    onClick={() => handleUpdateStatus('SERVED')}
                    className="btn-primary py-4 flex items-center justify-center gap-2"
                  >
                    <Check size={20} />
                    Atendido
                  </button>
                  <button
                    onClick={() => handleUpdateStatus('DONE')}
                    className="bg-accent-green/10 text-accent-green border border-accent-green/20 hover:bg-accent-green/20 py-4 font-bold rounded-xl flex items-center justify-center gap-2"
                  >
                    <XCircle size={20} />
                    Finalizar
                  </button>
                </div>

                {user.advisor_profile === 'PRINCIPAL' && suplentes.length > 0 && (
                  <div className="bg-gray-50 border border-black/10 rounded-2xl p-4 max-w-md mx-auto flex flex-col gap-3">
                    <h4 className="text-sm font-bold text-text-muted text-left uppercase">Asignar a Suplente</h4>
                    <select
                      value={selectedSuplente}
                      onChange={e => setSelectedSuplente(e.target.value)}
                      className="input-field w-full text-base"
                    >
                      <option value="">Seleccione suplente...</option>
                      {suplentes.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleAssign}
                      disabled={!selectedSuplente}
                      className="btn-primary py-3 flex items-center justify-center disabled:opacity-50"
                    >
                      Trasladar Turno
                    </button>
                  </div>
                )}

                <button
                  onClick={handleRecall}
                  className="mt-6 flex items-center justify-center gap-2 text-text-muted hover:text-primary transition-colors mx-auto text-sm"
                >
                  <Bell size={16} />
                  Volver a llamar
                </button>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-24 h-24 bg-primary/5 border border-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Play size={40} className="text-primary ml-1" />
                </div>
                <h3 className="text-2xl font-bold mb-8">¿Listo para llamar?</h3>
                <button
                  onClick={handleCallNext}
                  disabled={waitingTickets.length === 0}
                  className={`btn-primary px-10 py-5 text-xl flex items-center gap-3 transition-all ${waitingTickets.length === 0 ? 'opacity-50 cursor-not-allowed scale-95' : 'hover:scale-105 active:scale-95'}`}
                >
                  <ChevronRight size={24} />
                  <span>Llamar siguiente turno</span>
                </button>
                <p className="mt-4 text-text-muted text-sm">
                  {waitingTickets.length} {waitingTickets.length === 1 ? 'turno en espera' : 'turnos en espera'}
                </p>
                {waitingTickets.length > 0 && (
                  <div className="mt-6 inline-flex items-center gap-4 bg-gray-50 border border-black/10 rounded-2xl px-6 py-4">
                    <span className="text-xs font-bold uppercase tracking-widest text-text-muted">Siguiente</span>
                    <span className="text-3xl font-mono font-black text-primary tabular-nums">{waitingTickets[0].turn_number}</span>
                    <span className="text-xs text-text-muted">ID: {waitingTickets[0].requester_id_number}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Waiting List Sidebar */}
        <div className="flex flex-col gap-6">
          <div className="glass-card flex-1 p-6">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Users size={20} className="text-primary" />
              {user.advisor_profile === 'SUPLENTE' ? 'Turnos asignados a ti' : 'Turnos en espera'}
              <span className="ml-auto bg-primary text-white text-sm font-black px-3 py-1 rounded-full tabular-nums">
                {waitingTickets.length}
              </span>
            </h3>

            <div className="flex flex-col gap-3 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
              {waitingTickets.length === 0 ? (
                <div className="text-center py-20 text-text-muted">
                  <p>Lista vacía</p>
                </div>
              ) : (
                waitingTickets.map((ticket, idx) => (
                  <div key={ticket.id} className="bg-gray-50 border border-black/10 p-4 rounded-xl flex justify-between items-center group hover:border-primary/40 transition-colors animate-fade-in">
                    <div>
                      <span className="text-xl font-mono font-bold text-primary">{ticket.turn_number}</span>
                      <p className="text-xs text-text-muted mt-1">ID: {ticket.requester_id_number}</p>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-text-muted bg-white border border-black/10 px-2 py-1 rounded">
                      #{idx + 1}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Cambiar Contraseña */}
      {isChangePasswordOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-black/10 rounded-2xl p-8 w-full max-w-md shadow-2xl animate-fade-in">
            <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center mb-4 text-primary">
              <Key size={24} />
            </div>
            <h3 className="text-2xl font-bold mb-2">Cambiar Contraseña</h3>
            <p className="text-sm text-text-muted mb-6">
              {user?.requires_password_change
                ? 'Por razones de seguridad, debes cambiar tu contraseña inicial antes de atender turnos.'
                : 'Ingresa tu nueva contraseña para actualizarla en el sistema.'}
            </p>

            <form onSubmit={submitChangePassword} className="flex flex-col gap-4">
              {passwordError && <div className="text-accent-red bg-accent-red/10 border border-accent-red/20 p-4 rounded-xl text-sm font-semibold">{passwordError}</div>}
              {passwordSuccess && <div className="text-accent-green bg-accent-green/10 border border-accent-green/20 p-4 rounded-xl text-sm font-semibold flex items-center gap-2"><Check size={16} /> Contraseña actualizada con éxito.</div>}

              <div>
                <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Contraseña Actual</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                  <input
                    required
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    type="password"
                    className="input-field w-full !pl-12 h-12"
                    placeholder={user?.requires_password_change ? 'Tu contraseña inicial' : 'Tu contraseña actual'}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Nueva Contraseña</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                  <input
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    type="password"
                    className="input-field w-full !pl-12 h-12"
                    placeholder="Nueva contraseña"
                    minLength={8}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Confirmar Nueva Contraseña</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                  <input
                    required
                                  value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    type="password"
                    className="input-field w-full !pl-12 h-12"
                    placeholder="Repite la nueva contraseña"
                    minLength={8}
                  />
                </div>
              </div>

              <div className="flex gap-4 mt-6">
                {!user?.requires_password_change && (
                  <button type="button" onClick={() => setIsChangePasswordOpen(false)} className="px-6 py-3 w-1/3 bg-white border border-black/10 hover:bg-gray-50 rounded-xl font-bold transition-colors text-sm">
                    Cancelar
                  </button>
                )}
                <button type="submit" disabled={isPasswordLoading || passwordSuccess} className="btn-primary flex-1 py-3 text-sm flex justify-center">
                  {isPasswordLoading ? 'Guardando...' : 'Aceptar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdvisorPage;
