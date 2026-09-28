import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import RequesterPage from './pages/RequesterPage';
import LoginPage from './pages/LoginPage';
import AdvisorPage from './pages/AdvisorPage';
import BigScreenPage from './pages/BigScreenPage';
import AdminPage from './pages/AdminPage';
import MarketingPage from './pages/MarketingPage';
import RequireAuth from './components/RequireAuth';

import Header from './components/Header';

// El socket solo se abre en las pantallas que lo usan en tiempo real
// (asesor, pantalla de sala, admin, marketing). El kiosco y el login no
// abren conexiones fantasma contra el backend.
const WithSocket = ({ children }) => (
  <SocketProvider>{children}</SocketProvider>
);

function App() {
  return (
    <BrowserRouter>
      <div className="flex flex-col min-h-screen bg-bg-main text-text-main">
        <Header />
        <div className="flex-1 flex flex-col relative w-full h-full">
          <Routes>
            <Route path="/" element={<RequesterPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/screen" element={<WithSocket><BigScreenPage /></WithSocket>} />
            <Route path="/advisor" element={
              <RequireAuth roles={['ADVISOR', 'ADMIN']}>
                <WithSocket><AdvisorPage /></WithSocket>
              </RequireAuth>
            } />
            <Route path="/admin" element={
              <RequireAuth roles={['ADMIN']}>
                <WithSocket><AdminPage /></WithSocket>
              </RequireAuth>
            } />
            <Route path="/marketing" element={
              <RequireAuth roles={['MARKETING', 'ADMIN']}>
                <WithSocket><MarketingPage /></WithSocket>
              </RequireAuth>
            } />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
