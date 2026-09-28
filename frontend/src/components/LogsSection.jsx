import React, { useState, useEffect, useCallback } from 'react';
import { getLogs } from '../services/api';
import { Database, RefreshCw } from 'lucide-react';

const ACTION_LABELS = {
  LOGIN: 'Inicio de sesión',
  TICKET_CALL: 'Llamó un turno',
  TICKET_SERVED: 'Atendió un turno',
  TICKET_DONE: 'Finalizó un turno',
  TICKET_TRANSFER: 'Transfirió un turno',
  TICKET_CANCELLED: 'Canceló un turno',
  USER_CREATED: 'Creó usuario',
  USER_UPDATED: 'Actualizó usuario',
  USER_DELETED: 'Eliminó usuario',
  AREA_CREATED: 'Creó área',
  VIDEO_UPLOADED: 'Subió video',
  IMAGE_UPLOADED: 'Subió imagen',
  PARAM_UPDATED: 'Actualizó un parámetro',
  VIDEO_DELETED: 'Eliminó video',
};

const LogsSection = ({ searchQuery = '' }) => {
  const [logs, setLogs] = useState([]);
  const [actionFilter, setActionFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Búsqueda context-aware del header del admin
  const q = (searchQuery || '').trim().toLowerCase();
  const visibleLogs = q
    ? logs.filter(l =>
        l.user_name?.toLowerCase().includes(q) ||
        (ACTION_LABELS[l.action] || l.action || '').toLowerCase().includes(q) ||
        String(l.entity_id ?? '').includes(q) ||
        (l.detail || '').toLowerCase().includes(q))
    : logs;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getLogs(actionFilter ? { action: actionFilter } : {});
      setLogs(res.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Error cargando el registro');
    } finally {
      setLoading(false);
    }
  }, [actionFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const fmtDate = (iso) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'medium' });

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="input-field h-11 w-72"
        >
          <option value="">Todas las acciones</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button onClick={fetchLogs} disabled={loading} className="flex items-center gap-2 bg-white border border-black/10 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-gray-50 hover:border-primary/40 transition-colors disabled:opacity-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
        <span className="text-text-muted text-sm ml-auto">{visibleLogs.length} registros</span>
      </div>

      {error && <div className="mb-4 p-4 rounded-xl bg-accent-red/10 border border-accent-red/20 text-accent-red font-semibold">{error}</div>}

      <div className="glass-card p-0 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr className="text-left text-text-muted text-xs uppercase tracking-wider border-b border-black/10">
              <th className="px-5 py-3">Fecha</th>
              <th className="px-5 py-3">Usuario</th>
              <th className="px-5 py-3">Acción</th>
              <th className="px-5 py-3">Entidad</th>
              <th className="px-5 py-3">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {visibleLogs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-16 text-center text-text-muted">
                  <Database size={32} className="mx-auto mb-3 opacity-40" />
                  {loading ? 'Cargando...' : q ? `Sin registros que coincidan con “${searchQuery}”` : 'No hay registros de actividad todavía.'}
                </td>
              </tr>
            ) : (
              visibleLogs.map(log => {
                let detail = null;
                try { detail = log.detail ? JSON.parse(log.detail) : null; } catch { detail = null; }
                return (
                  <tr key={log.id} className="border-b border-black/5 hover:bg-primary/[0.03] transition-colors">
                    <td className="px-5 py-3 whitespace-nowrap text-text-muted">{fmtDate(log.created_at)}</td>
                    <td className="px-5 py-3 font-semibold">{log.user_name || '— (kiosco/sistema)'}</td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-1 bg-primary/10 text-primary text-xs font-bold rounded-lg">
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-text-muted">{log.entity}#{log.entity_id ?? '—'}</td>
                    <td className="px-5 py-3 text-text-muted max-w-[280px] truncate" title={log.detail || ''}>
                      {detail?.turn ? `Turno ${detail.turn}` : detail?.name || detail?.originalName || '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LogsSection;
