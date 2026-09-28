import React, { useState } from 'react';
import { FileText, Download, Calendar, Search, Users } from 'lucide-react';
import { getAdvisorReport, getRequesterReport, getDailyReport } from '../services/api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const ReportsSection = ({ data }) => {
  const [reportType, setReportType] = useState('advisor');

  // States for Advisor Report
  const [advisorId, setAdvisorId] = useState('todos');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // States for Requester Report
  const [requesterId, setRequesterId] = useState('');

  // States for Daily Report
  const [dailyDate, setDailyDate] = useState('');

  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      if (reportType === 'advisor') {
        if (!advisorId || !startDate || !endDate) throw new Error("Llena todos los campos");
        const res = await getAdvisorReport({ advisor_id: advisorId, startDate, endDate });
        setReportData(res.data);
      } else if (reportType === 'requester') {
        if (!requesterId) throw new Error("Inserta la cédula del solicitante");
        const res = await getRequesterReport({ requester_id_number: requesterId });
        setReportData(res.data);
      } else if (reportType === 'daily') {
        if (!dailyDate) throw new Error("Inserta una fecha válida");
        const res = await getDailyReport({ date: dailyDate });
        setReportData(res.data);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Error obteniendo datos");
      setReportData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    if (!reportData || reportData.length === 0) return;

    let exportData = [];
    if (reportType === 'advisor') {
      exportData = reportData.map(t => ({
        'Asesor': t.advisor?.name || 'No asignado',
        'Turno': t.turn_number,
        'Solicitante (CC)': t.requester_id_number,
        'Área': t.area?.name,
        'Estado': t.status,
        'Fecha': new Date(t.created_at).toLocaleString()
      }));
    } else if (reportType === 'requester') {
      exportData = reportData.map(t => ({
        'Turno': t.turn_number,
        'Solicitante (CC)': t.requester_id_number,
        'Asesor': t.advisor?.name || 'No asignado',
        'Área': t.area?.name,
        'Estado': t.status,
        'Fecha': new Date(t.created_at).toLocaleString()
      }));
    } else if (reportType === 'daily') {
      exportData = reportData.map(a => ({
        'Asesor ID': a.id,
        'Asesor Nombre': a.name,
        'Total Atendidos': a.count
      }));
    }

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte");
    XLSX.writeFile(wb, `Reporte_${reportType}_${new Date().getTime()}.xlsx`);
  };

  const handleExportPDF = () => {
    if (!reportData || reportData.length === 0) return;
    const doc = new jsPDF();

    let head = [];
    let body = [];

    if (reportType === 'advisor') {
      head = [['Asesor', 'Turno', 'Solicitante (CC)', 'Área', 'Fecha']];
      body = reportData.map(t => [t.advisor?.name || 'No asignado', t.turn_number, t.requester_id_number, t.area?.name, new Date(t.created_at).toLocaleString()]);
    } else if (reportType === 'requester') {
      head = [['Turno', 'Asesor', 'Área', 'Fecha']];
      body = reportData.map(t => [t.turn_number, t.advisor?.name || 'No asignado', t.area?.name, new Date(t.created_at).toLocaleString()]);
    } else if (reportType === 'daily') {
      head = [['Asesor Nombre', 'Total Atendidos']];
      body = reportData.map(a => [a.name, a.count]);
    }

    doc.text(`Reporte: ${reportType.toUpperCase()}`, 14, 15);
    doc.autoTable({
      startY: 20,
      head: head,
      body: body,
      theme: 'grid',
      headStyles: { fillColor: [99, 102, 241] } // primary color
    });
    doc.save(`Reporte_${reportType}_${new Date().getTime()}.pdf`);
  };

  return (
    <div className="animate-fade-in flex flex-col gap-8">
      {/* Configuration Cards */}
      <div className="glass-card p-8 flex flex-col gap-6">
        <h3 className="text-2xl font-bold flex items-center gap-3">
          <FileText className="text-primary" />
          Configuración de Reporte
        </h3>

        <div className="flex gap-4 border-b border-black/10 pb-6">
          <button
            onClick={() => { setReportType('advisor'); setReportData([]); }}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${reportType === 'advisor' ? 'bg-primary text-white shadow-lg shadow-primary/25' : 'bg-white text-slate-500 border border-black/10 hover:bg-gray-50'}`}
          >
            Por Asesor
          </button>
          <button
            onClick={() => { setReportType('requester'); setReportData([]); }}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${reportType === 'requester' ? 'bg-primary text-white shadow-lg shadow-primary/25' : 'bg-white text-slate-500 border border-black/10 hover:bg-gray-50'}`}
          >
            Por Solicitante
          </button>
          <button
            onClick={() => { setReportType('daily'); setReportData([]); }}
            className={`px-6 py-3 rounded-xl font-bold transition-all ${reportType === 'daily' ? 'bg-primary text-white shadow-lg shadow-primary/25' : 'bg-white text-slate-500 border border-black/10 hover:bg-gray-50'}`}
          >
            Resumen Diario
          </button>
        </div>

        {/* Dynamic Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
          {reportType === 'advisor' && (
            <>
              <div>
                <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-2"><Users size={14} /> Seleccionar Asesor</label>
                <select value={advisorId} onChange={e => setAdvisorId(e.target.value)} className="input-field w-full h-11">
                  <option value="todos">Todos</option>
                  {data?.users?.filter(u => u.role === 'ADVISOR').map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.id_number})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-2"><Calendar size={14} /> Fecha Inicial <span className="normal-case font-normal opacity-60">(de atención)</span></label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-field w-full h-11" />
              </div>
              <div>
                <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-2"><Calendar size={14} /> Fecha Final</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input-field w-full h-11" />
              </div>
            </>
          )}

          {reportType === 'requester' && (
            <div className="col-span-2">
              <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-2"><Search size={14} /> Cédula Solicitante</label>
              <input type="text" value={requesterId} onChange={e => setRequesterId(e.target.value)} placeholder="Ej. 1002345678" className="input-field w-full h-11" />
            </div>
          )}

          {reportType === 'daily' && (
            <div className="col-span-2">
              <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-2"><Calendar size={14} /> Fecha del Resumen</label>
              <input type="date" value={dailyDate} onChange={e => setDailyDate(e.target.value)} className="input-field w-full h-11" />
            </div>
          )}

          <div>
            <button onClick={fetchReport} disabled={loading} className="btn-primary w-full h-11 flex items-center justify-center gap-2">
              {loading ? 'Generando...' : 'Generar Reporte'}
            </button>
          </div>
        </div>

        {error && <div className="text-accent-red font-semibold">{error}</div>}
      </div>

      {/* Results Actions */}
      <div className="glass-card flex-1 p-0 overflow-hidden flex flex-col min-h-[400px]">
        <div className="p-6 border-b border-black/10 flex justify-between items-center bg-gray-50">
          <h4 className="text-lg font-bold">Resultados del Reporte</h4>
          <div className="flex gap-4">
            <button onClick={handleExportExcel} disabled={reportData.length === 0} className="px-4 py-2 bg-accent-green/20 text-accent-green hover:bg-accent-green/30 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold text-sm flex items-center gap-2 transition-colors">
              <Download size={16} /> Excel
            </button>
            <button onClick={handleExportPDF} disabled={reportData.length === 0} className="px-4 py-2 bg-accent-red/20 text-accent-red hover:bg-accent-red/30 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold text-sm flex items-center gap-2 transition-colors">
              <Download size={16} /> PDF
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-0">
          <table className="data-table">
            <thead>
              <tr className="bg-gray-50 text-text-muted text-xs uppercase tracking-widest font-black border-b border-black/5">
                {reportType === 'advisor' && (
                  <>
                    <th className="px-6 py-4">Asesor</th>
                    <th className="px-6 py-4">Turno</th>
                    <th className="px-6 py-4">Solicitante (CC)</th>
                    <th className="px-6 py-4">Área</th>
                    <th className="px-6 py-4">Fecha</th>
                  </>
                )}
                {reportType === 'requester' && (
                  <>
                    <th className="px-6 py-4">Turno</th>
                    <th className="px-6 py-4">Asesor</th>
                    <th className="px-6 py-4">Área</th>
                    <th className="px-6 py-4">Fecha</th>
                  </>
                )}
                {reportType === 'daily' && (
                  <>
                    <th className="px-6 py-4">Asesor</th>
                    <th className="px-6 py-4">Total Atendidos</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {reportData.length === 0 ? (
                <tr><td colSpan="5" className="p-8 text-center text-text-muted italic">No hay datos que mostrar.</td></tr>
              ) : (
                reportData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-primary/[0.03] transition-colors">
                    {reportType === 'advisor' && (
                      <>
                        <td className="px-6 py-4 font-bold">{row.advisor?.name || 'No asignado'}</td>
                        <td className="px-6 py-4 font-bold">{row.turn_number}</td>
                        <td className="px-6 py-4">{row.requester_id_number}</td>
                        <td className="px-6 py-4">{row.area?.name}</td>
                        <td className="px-6 py-4 text-sm text-text-muted">{new Date(row.created_at).toLocaleString()}</td>
                      </>
                    )}
                    {reportType === 'requester' && (
                      <>
                        <td className="px-6 py-4 font-bold">{row.turn_number}</td>
                        <td className="px-6 py-4">{row.advisor?.name || 'No asignado'}</td>
                        <td className="px-6 py-4">{row.area?.name}</td>
                        <td className="px-6 py-4 text-sm text-text-muted">{new Date(row.created_at).toLocaleString()}</td>
                      </>
                    )}
                    {reportType === 'daily' && (
                      <>
                        <td className="px-6 py-4 font-bold">{row.name}</td>
                        <td className="px-6 py-4">{row.count}</td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReportsSection;
