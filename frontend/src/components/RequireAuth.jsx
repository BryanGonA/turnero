import React from 'react';
import { Navigate } from 'react-router-dom';

// Parseo defensivo: un valor corrupto en localStorage no rompe la app
export const getSessionUser = () => {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const user = JSON.parse(raw);
    if (!user || typeof user.id !== 'number' || !user.role) return null;
    return user;
  } catch {
    return null;
  }
};

// Guarda de ruta: exige sesión y (opcionalmente) uno de los roles indicados.
const RequireAuth = ({ roles, children }) => {
  const token = localStorage.getItem('token');
  const user = getSessionUser();

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

export default RequireAuth;
