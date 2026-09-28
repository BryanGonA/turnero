import React, { useState, useEffect, useCallback } from 'react';
import { getParameters, setParameter } from '../services/api';
import { Settings, Plus, Save } from 'lucide-react';

const ParamsSection = () => {
  const [params, setParams] = useState([]);
  const [newParam, setNewParam] = useState({ key: '', value: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);

  const fetchParams = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getParameters();
      setParams(res.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Error cargando parámetros');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchParams(); }, [fetchParams]);

  const save = async (key, value) => {
    setError(null);
    setSaved(null);
    try {
      await setParameter({ key, value });
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
      fetchParams();
    } catch (err) {
      setError(err.response?.data?.error || 'Error guardando parámetro');
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    await save(newParam.key.trim(), newParam.value);
    setNewParam({ key: '', value: '' });
  };

  return (
    <div className="animate-fade-in max-w-3xl">
      {error && <div className="mb-4 p-4 rounded-xl bg-accent-red/10 border border-accent-red/20 text-accent-red font-semibold">{error}</div>}

      <form onSubmit={handleAdd} className="glass-card p-6 mb-8 flex flex-col md:flex-row gap-4 items-end">
        <div className="flex-1 w-full">
          <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Clave</label>
          <input required value={newParam.key} onChange={e => setNewParam({ ...newParam, key: e.target.value })} type="text" className="input-field w-full" placeholder="ej. mensaje_pantalla" />
        </div>
        <div className="flex-1 w-full">
          <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Valor</label>
          <input required value={newParam.value} onChange={e => setNewParam({ ...newParam, value: e.target.value })} type="text" className="input-field w-full" placeholder="ej. Bienvenidos al Consultorio" />
        </div>
        <button type="submit" className="btn-primary px-6 py-3 flex items-center gap-2">
          <Plus size={18} />
          Agregar
        </button>
      </form>

      <div className="glass-card p-0 overflow-x-auto">
        {params.length === 0 ? (
          <div className="text-center py-16 text-text-muted">
            <Settings size={32} className="mx-auto mb-3 opacity-40" />
            {loading ? 'Cargando...' : 'No hay parámetros configurados.'}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr className="text-left text-text-muted text-xs uppercase tracking-wider border-b border-black/10">
                <th className="px-5 py-3">Clave</th>
                <th className="px-5 py-3">Valor</th>
                <th className="px-5 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {params.map(p => (
                <ParamRow key={p.id} param={p} onSave={save} saved={saved === p.key} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const ParamRow = ({ param, onSave, saved }) => {
  const [value, setValue] = useState(param.value);
  const dirty = value !== param.value;
  return (
    <tr className="border-b border-black/5 hover:bg-primary/[0.03] transition-colors">
      <td className="px-5 py-3 font-mono font-semibold">{param.key}</td>
      <td className="px-5 py-3">
        <input value={value} onChange={e => setValue(e.target.value)} className="input-field w-full h-9" />
      </td>
      <td className="px-5 py-3 text-right">
        <button
          onClick={() => onSave(param.key, value)}
          disabled={!dirty}
          className="btn-primary px-4 py-2 text-xs flex items-center gap-1 disabled:opacity-40"
        >
          <Save size={14} />
          {saved ? 'Guardado ✓' : 'Guardar'}
        </button>
      </td>
    </tr>
  );
};

export default ParamsSection;
