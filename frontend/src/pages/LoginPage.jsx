import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/api';
import { Lock, User, ArrowRight, Eye, EyeOff } from 'lucide-react';

const LoginPage = () => {
  const [idNumber, setIdNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await login({ id_number: idNumber, password });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));

      if (res.data.user.role === 'ADVISOR') {
        navigate('/advisor');
      } else if (res.data.user.role === 'ADMIN') {
        navigate('/admin');
      } else if (res.data.user.role === 'MARKETING') {
        navigate('/marketing');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-card relative w-full max-w-md animate-fade-in !shadow-lg overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary via-[#e5484d] to-secondary rounded-t-3xl" />
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-gradient-to-br from-primary to-primary-hover rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-primary/30">
            <Lock className="text-white" size={30} />
          </div>
          <h1 className="text-3xl font-black mb-2">Bienvenido</h1>
          <p className="text-text-muted">Consultorio Jurídico · Ingrese sus credenciales</p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-6">
          {error && (
            <div className="bg-accent-red/10 border border-accent-red/20 text-accent-red p-4 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-muted">Usuario</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
              <input
                required
                type="text"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                className="input-field w-full !pl-14 h-14"
                placeholder="Usuario"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text-muted">Contraseña</label>
            <div className="relative flex items-center">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
              <input
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field w-full !pl-14 !pr-12 h-14"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 text-text-muted hover:text-primary transition-colors cursor-pointer flex items-center justify-center p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button
            disabled={loading}
            className="btn-primary py-4 text-lg flex items-center justify-center gap-2 group mt-4"
          >
            {loading ? 'Autenticando...' : 'Ingresar'}
            {!loading && <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
