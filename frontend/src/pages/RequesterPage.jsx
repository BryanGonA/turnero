import React, { useState, useEffect } from 'react';
import { getAreas, createTicket } from '../services/api';
import { CheckCircle2, Delete, Printer, Loader2, ChevronLeft } from 'lucide-react';

// Gradientes institucionales rotativos para los tiles de módulo (≤ 4 códigos de color)
const AREA_GRADIENTS = [
  'from-[#ce1a1e] to-[#a5121a]',
  'from-[#0ea5e9] to-[#0369a1]',
  'from-[#10b981] to-[#047857]',
  'from-[#bf9900] to-[#d4af37]',
];

const RequesterPage = () => {
  const [areas, setAreas] = useState([]);
  const [selectedArea, setSelectedArea] = useState(null);
  const [step, setStep] = useState(1); // 1 = módulo, 2 = cédula (una entrada por vez)
  const [idNumber, setIdNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastTicket, setLastTicket] = useState(null);

  useEffect(() => {
    getAreas().then(res => setAreas(res.data.filter(a => a.is_public !== false)));
  }, []);

  useEffect(() => {
    if (lastTicket) {
      const handleAfterPrint = () => {
        // Retrasamos el reseteo 1 segundo para que el usuario alcance a leer el último ticket
        setTimeout(() => setLastTicket(null), 1000);
      };

      window.addEventListener('afterprint', handleAfterPrint);

      const printTimer = setTimeout(() => {
        window.print();
      }, 500);

      const resetTimer = setTimeout(() => {
        setLastTicket(null);
      }, 10000);

      return () => {
        clearTimeout(printTimer);
        clearTimeout(resetTimer);
        window.removeEventListener('afterprint', handleAfterPrint);
      };
    }
  }, [lastTicket]);

  const handleTakeTicket = async (e) => {
    e.preventDefault();
    if (!selectedArea || !idNumber) return;

    setLoading(true);
    try {
      const res = await createTicket({
        area_id: selectedArea.id,
        requester_id_number: idNumber
      });
      setLastTicket(res.data);
      setIdNumber('');
      setSelectedArea(null);
      setStep(1);
    } catch (err) {
      console.error(err);
      alert('Error creating ticket');
    } finally {
      setLoading(false);
    }
  };

  if (lastTicket) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] animate-fade-in print:min-h-0 print:block print:p-0 print:m-0">
        {/* Ticket Container (Web + Print) */}
        <div className="glass-card text-center max-w-md w-full print:shadow-none print:border-none print:bg-transparent print:p-0 print:m-0 print:w-full print:max-w-full">
          <CheckCircle2 size={64} className="text-accent-green mb-4 mx-auto print:hidden" />

          <h1 className="text-3xl font-bold mb-2 print:hidden">Ticket de Turno</h1>
          <p className="text-text-muted mb-6 border-b border-black/10 pb-4 print:hidden">
            Universidad Libre
          </p>

          <div className="bg-primary/10 rounded-2xl p-8 mb-6 border border-primary/20 print:border-none print:bg-transparent print:p-1 print:mb-2">
            <span className="text-text-muted text-sm uppercase tracking-widest print:text-sm print:text-black">Tu Turno</span>
            <div className="text-6xl font-black text-primary mt-2 print:text-5xl print:text-black print:mt-1">
              {lastTicket.turn_number}
            </div>

            <div className="mt-4 print:mt-2">
              <span className="text-text-muted text-sm uppercase tracking-widest print:text-sm print:text-black">Área</span>
              <div className="text-2xl font-bold text-gray-900 mt-1 print:text-xl print:text-black">{lastTicket.area?.name}</div>
            </div>
          </div>

          <div className="hidden print:block print:text-xs print:text-black print:mt-4 print:pt-2 print:border-t print:border-black/30">
            <p>{new Date(lastTicket.created_at).toLocaleString('es-ES')}</p>
            <p className="mt-2 font-bold opacity-80">Por favor, espera ser llamado.</p>
          </div>

          <button
            onClick={() => setLastTicket(null)}
            className="btn-primary w-full py-4 text-lg print:hidden"
          >
            Sacar Otro Turno
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 w-full flex flex-col items-center px-4 md:px-8 overflow-hidden">
      <div className="w-full h-full flex flex-col max-w-6xl">

        {/* Header contextual: título + pills de paso */}
        <div className="text-center pt-3 lg:pt-4 2xl:pt-6 shrink-0">
          <h1 className="text-2xl md:text-3xl lg:text-3xl 2xl:text-4xl font-extrabold text-primary leading-tight">
            {step === 1 ? 'Bienvenido a Asesorías Jurídicas' : 'Ingrese su cédula'}
          </h1>
          <p className="text-text-muted text-xs md:text-sm lg:text-base font-medium mt-1.5 2xl:mt-2">
            {step === 1
              ? 'Seleccione el módulo de atención'
              : 'Digite su número de documento y retire su turno'}
          </p>
          <div className="flex justify-center items-center gap-2.5 mt-3 2xl:mt-4">
            <span className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs md:text-sm font-black uppercase tracking-widest transition-all ${step === 1 ? 'bg-primary text-white shadow-md shadow-primary/30' : 'bg-black/[0.06] text-text-muted'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 1 ? 'bg-white text-primary' : 'bg-black/10 text-text-muted'}`}>1</span>
              Módulo
            </span>
            <span className="w-5 border-t-2 border-dashed border-black/20" aria-hidden="true" />
            <span className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs md:text-sm font-black uppercase tracking-widest transition-all ${step === 2 ? 'bg-primary text-white shadow-md shadow-primary/30' : 'bg-black/[0.06] text-text-muted'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 2 ? 'bg-white text-primary' : 'bg-black/10 text-text-muted'}`}>2</span>
              Cédula
            </span>
          </div>
        </div>

        {/* Zona de contenido: overflow-hidden = la barra de scroll NO EXISTE.
            El teclado se adapta con flex-1 al alto disponible. */}
        <div className="flex-1 min-h-0 flex items-center justify-center py-2 2xl:py-3 overflow-hidden">

          {/* PASO 1: pantalla limpia, solo selección de módulo */}
          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5 2xl:gap-6 w-full animate-fade-in">
              {areas.map((area, idx) => (
                <button
                  key={area.id}
                  type="button"
                  onClick={() => { setSelectedArea(area); setStep(2); }}
                  className="group min-h-[150px] lg:min-h-[260px] 2xl:min-h-[320px] flex flex-col items-center justify-center gap-4 lg:gap-5 p-5 lg:p-7 2xl:p-8 bg-white border-2 border-black/10 rounded-3xl shadow-md hover:shadow-2xl hover:border-primary/50 hover:-translate-y-1.5 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  <span className={`w-16 h-16 lg:w-20 lg:h-20 2xl:w-24 2xl:h-24 rounded-3xl flex items-center justify-center shrink-0 text-white font-black text-2xl lg:text-3xl tracking-wide bg-gradient-to-br shadow-lg group-hover:scale-105 transition-transform ${AREA_GRADIENTS[idx % AREA_GRADIENTS.length]}`}>
                    {area.id_prefix}
                  </span>
                  <span className="text-center">
                    <h3 className="text-base md:text-lg lg:text-xl font-bold leading-snug">{area.name}</h3>
                    <p className="text-text-muted text-[10px] lg:text-xs font-bold uppercase tracking-widest mt-1.5 lg:mt-2">Módulo de atención</p>
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* PASO 2: cédula. En pantallas anchas: display | teclado lado a lado.
              El teclado usa flex-1: se adapta al ALTO disponible y jamás genera scroll. */}
          {step === 2 && selectedArea && (
            <div className="w-full h-full max-w-2xl lg:max-w-3xl 2xl:max-w-5xl flex flex-col bg-white rounded-3xl border border-black/10 shadow-xl overflow-hidden animate-fade-in">
              <div className="bg-gradient-to-r from-primary to-primary-hover px-4 lg:px-6 py-2.5 flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="shrink-0 flex items-center gap-1 pl-2 pr-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs md:text-sm font-bold transition-colors cursor-pointer"
                >
                  <ChevronLeft size={16} />
                  Volver
                </button>
                <span className={`w-10 h-10 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center shrink-0 text-white font-black text-sm lg:text-base tracking-wide bg-gradient-to-br shadow ${AREA_GRADIENTS[Math.max(0, areas.findIndex(a => a.id === selectedArea.id)) % AREA_GRADIENTS.length]}`}>
                  {selectedArea.id_prefix}
                </span>
                <div className="min-w-0">
                  <h2 className="text-white text-sm md:text-base lg:text-lg font-black leading-tight truncate">{selectedArea.name}</h2>
                  <p className="text-white/80 text-[10px] md:text-xs lg:text-sm font-medium mt-0.5">Paso 2 · Ingrese su número de cédula</p>
                </div>
              </div>

              <form onSubmit={handleTakeTicket} className="flex-1 min-h-0 flex flex-col gap-3 p-4 2xl:p-5 overflow-hidden">
                {/* Display del documento: ARRIBA del teclado, misma columna centrada */}
                <input
                  required
                  type="text"
                  value={idNumber}
                  readOnly
                  aria-label="Número de documento"
                  placeholder="INGRESE SU DOCUMENTO"
                  className="shrink-0 mx-auto w-full max-w-[38rem] 2xl:max-w-[42rem] text-center text-2xl md:text-3xl lg:text-4xl font-black tracking-[0.15em] tabular-nums bg-primary/[0.04] border-2 border-dashed border-primary/40 rounded-2xl py-2.5 lg:py-3 outline-none focus:border-primary/70 transition-colors"
                />

                {/* Teclado: centrado (mx-auto), un poco más ancho, filas flexibles */}
                <div className="flex-1 min-h-0 mx-auto w-full max-w-[38rem] 2xl:max-w-[42rem] grid grid-cols-3 grid-rows-4 gap-2 lg:gap-2.5 2xl:gap-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setIdNumber(prev => prev.length < 12 ? prev + num : prev)}
                      className="min-h-0 h-full text-xl md:text-2xl lg:text-2xl 2xl:text-3xl font-black rounded-2xl border-2 border-black/10 bg-gray-50 hover:bg-white hover:border-primary/40 active:scale-95 active:bg-primary/10 transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setIdNumber('')}
                    className="min-h-0 h-full text-[10px] md:text-xs lg:text-xs 2xl:text-sm font-black rounded-2xl border-2 border-accent-red/20 bg-accent-red/10 text-accent-red uppercase tracking-widest hover:bg-accent-red/20 active:bg-accent-red/30 active:scale-95 transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    Borrar
                  </button>
                  <button
                    type="button"
                    onClick={() => setIdNumber(prev => prev.length < 12 ? prev + '0' : prev)}
                    className="min-h-0 h-full text-xl md:text-2xl lg:text-2xl 2xl:text-3xl font-black rounded-2xl border-2 border-black/10 bg-gray-50 hover:bg-white hover:border-primary/40 active:scale-95 active:bg-primary/10 transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => setIdNumber(prev => prev.slice(0, -1))}
                    className="min-h-0 h-full rounded-2xl border-2 border-red-200 bg-red-50 text-primary hover:bg-red-100 active:scale-95 transition-all shadow-sm flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    <Delete size={20} className="2xl:hidden" />
                    <Delete size={24} className="hidden 2xl:block" />
                  </button>
                </div>

                {/* CTA: más compacto, centrado, mismo ancho de columna */}
                <button
                  disabled={loading || !idNumber || !selectedArea}
                  className="shrink-0 btn-primary py-2.5 md:py-3 lg:py-2.5 mx-auto w-full max-w-[38rem] 2xl:max-w-[42rem] text-sm md:text-base lg:text-base 2xl:text-lg font-black flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed group disabled:shadow-none shadow-lg shadow-primary/30"
                >
                  {loading ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Imprimiendo su turno...
                    </>
                  ) : (
                    <>
                      IMPRIMIR TURNO
                      <Printer size={20} className="group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RequesterPage;
