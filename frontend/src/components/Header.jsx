import React, { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';

const Header = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDate = (date) => {
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <header className="w-full flex justify-between items-center gap-3 px-3 md:px-8 py-3 md:py-4 border-b border-black/10 text-white shrink-0 print:hidden bg-[#ce1a1e]">
      {/* Izquierda: Escudo */}
      <div className="flex items-center justify-start w-[110px] md:w-[240px] shrink-0">
        <img src="https://www.unilibre.edu.co/cali/wp-content/uploads/sites/11/2024/07/Logo-universidad-libre.svg" className="w-full max-w-[100px] md:max-w-none" alt="escudo"></img>
      </div>

      {/* Centro: Institución y dependencia */}
      <div className="flex flex-col items-center flex-1 text-center px-2 min-w-0">
        <h1 className="font-bold leading-tight text-white text-lg md:text-2xl">Universidad Libre</h1>
        <h2 className="text-white/85 mt-1 leading-tight font-medium text-sm md:text-xl">Seccional Cali</h2>
        <h2 className="text-white/70 mt-1 leading-tight font-medium text-xs md:text-base">Consultorio Jurídico</h2>
      </div>

      {/* Derecha: Fecha y hora (se ocultan en pantallas muy angostas) */}
      <div className="hidden sm:flex flex-col items-end w-[110px] md:w-[250px] justify-center text-right shrink-0">
        <div className="font-bold leading-tight w-full text-sm md:text-2xl">{formatDate(time)}</div>
        <div className="font-medium text-white/85 mt-1 leading-tight w-full text-sm md:text-2xl">{formatTime(time)}</div>
      </div>
    </header>
  );
};

export default Header;