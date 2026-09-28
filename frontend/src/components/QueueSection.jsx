import React, { useState, useEffect, useCallback } from 'react';
import { getTickets, updateTicket, getTodaySummary } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { ListOrdered, RefreshCw, XCircle, Clock } from 'lucide-react';

const STATUS_STYLES = {
  WAITING: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30',
  CALLING: 'bg-blue-500/10 text-blue-700 border-blue-500/30',
  SERVED: 'bg-accent-green/10 text-accent-green border-accent-green/20',
  DONE: 'bg-gray-100 text-text-muted border-black/10',
  UNSERVED: 'bg-accent-red/10 text-accent-red border-accent-red/20',
};

const STATUS_LABELS = {
  WAITING: 'En espera', CALLING: 'Llamando', SERVED: 'Atendido', DONE: 'Finalizado', UNSERVED: 'Cancelado/No atendido'
};

const QueueSection = ({ searchQuery = '' }) => {
  const [tickets, setTickets] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const socket = useSocket();

  // Búsqueda context-aware del header del admin
  const q = (searchQuery || '').trim().toLowerCase();
  const visibleTickets = q
    ? tickets.filter(t =>
        t.turn_number?.toLowerCase().includes(q) ||
        t.requester_id_number?.includes(q) ||
        t.area?.name?.toLowerCase().includes(q) ||
        t.advisor?.name?.toLowerCase().includes(q))
    : tickets;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, sRes] = await Promise.all([
        getTickets({}),
        getTodaySummary()
      ]);
      setTickets(tRes.data || []);
      setSummary(sRes.data || null);
    } catch (err) {
      setError(err.response?.data?.error || 'Error cargando la cola del día');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // La cola se refresca sola con los eventos en tiempo real
  useEffect(() => {
    if (!socket) return;
    const refresh = () => fetchData();
    socket.on('ticket_created', refresh);
    socket.on('ticket_called', refresh);
    socket.on('ticket_updated', refresh);
    return () => {
      socket.off('ticket_created', refresh);
      socket.off('ticket_called', refresh);
      socket.off('ticket_updated', refresh);
    };
  }, [socket, fetchData]);

  const cancelTicket = async (ticket) => {
    if (!window.confirm(`¿Cancelar el turno ${ticket.turn_number}?`)) return;
    setError(null);
    try {
      await updateTicket(ticket.id, { status: 'UNSERVED' });
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cancelar el turno');
    }
  };

  const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <div className="animate-fade-in">
      {/* Métricas de la jornada */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="stat-card text-center">
            <p className="text-3xl font-black text-primary">{summary.total}</p>
            <p className="text-xs text-text-muted uppercase tracking-wider mt-1">Turnos hoy</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-3xl font-black text-amber-600">{summary.byStatus.WAITING + summary.byStatus.CALLING}</p>
            <p className="text-xs text-text-muted uppercase tracking-wider mt-1">Activos</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-3xl font-black text-accent-green">{summary.byStatus.SERVED + summary.byStatus.DONE}</p>
            <p className="text-xs text-text-muted uppercase tracking-wider mt-1">Atendidos</p>
          </div>
          <div className="stat-card text-center">
            <p className="text-3xl font-black text-text-muted">{summary.avgAttentionMinutes ?? '—'}<span className="text-sm font-normal"> min</span></p>
            <p className="text-xs text-text-muted uppercase tracking-wider mt-1">Atención promedio</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <ListOrdered size={20} className="text-primary" />
          Cola de la jornada actual
        </h3>
        <button onClick={fetchData} disabled={loading} className="ml-auto flex items-center gap-2 bg-white border border-black/10 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-gray-50 hover:border-primary/40 transition-colors disabled:opacity-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {error && <div className="mb-4 p-4 rounded-xl bg-accent-red/10 border border-accent-red/20 text-accent-red font-semibold">{error}</div>}

      <div className="glass-card p-0 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr className="text-left text-text-muted text-xs uppercase tracking-wider border-b border-black/10">
              <th className="px-5 py-3">Turno</th>
              <th className="px-5 py-3">Área</th>
              <th className="px-5 py-3">Documento</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3">Asesor</th>
              <th className="px-5 py-3"><Clock size={14} /></th>
              <th className="px-5 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {visibleTickets.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-16 text-center text-text-muted">
                  {loading ? 'Cargando...' : q ? `Sin turnos que coincidan con “${searchQuery}”` : 'No hay turnos en la jornada de hoy.'}
                </td>
              </tr>
            ) : (
              visibleTickets.map(t => (
                <tr key={t.id} className="border-b border-black/5 hover:bg-primary/[0.03] transition-colors">
                  <td className="px-5 py-3 font-mono font-bold text-primary">{t.turn_number}</td>
                  <td className="px-5 py-3">{t.area?.name}</td>
                  <td className="px-5 py-3 font-mono text-text-muted">{t.requester_id_number}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-1 text-xs font-bold rounded-lg border ${STATUS_STYLES[t.status] || ''}`}>
                      {STATUS_LABELS[t.status] || t.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-text-muted">{t.advisor?.name || '—'}</td>
                  <td className="px-5 py-3 text-text-muted whitespace-nowrap">{fmtTime(t.called_at)}</td>
                  <td className="px-5 py-3 text-right">
                    {(t.status === 'WAITING' || t.status === 'CALLING') && (
                      <button
                        onClick={() => cancelTicket(t)}
                        title="Cancelar turno (no se presentó)"
                        className="p-2 rounded-lg text-accent-red hover:bg-accent-red/10 transition-colors"
                      >
                        <XCircle size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default QueueSection;
