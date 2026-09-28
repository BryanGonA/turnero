import axios from 'axios';

const currentHost = window.location.hostname;
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || `http://${currentHost}:3001/api`
});

// Inyecta el token en TODAS las peticiones automáticamente
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Sesión expirada o token inválido → limpiar y volver al login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const isLoginCall = error.config?.url?.endsWith('/login');
    if ((status === 401 || status === 403) && !isLoginCall && localStorage.getItem('token')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const getAreas = () => api.get('/areas');
export const createArea = (data) => api.post('/areas', data);
export const updateArea = (id, data) => api.put(`/areas/${id}`, data);
export const createTicket = (data) => api.post('/tickets', data);
export const login = (data) => api.post('/login', data);
export const getTickets = (params) => api.get('/tickets', { params });
export const updateTicket = (id, data) => api.put(`/tickets/${id}`, data);
export const assignTicket = (id, suplente_id) => api.put(`/tickets/${id}/assign`, { suplente_id });
export const changePassword = (data) => api.post('/change-password', data);
export const getUsers = () => api.get('/users');
export const getSuplentes = () => api.get('/users/suplentes');
export const createUser = (data) => api.post('/users', data);
export const updateUser = (id, data) => api.put(`/users/${id}`, data);
export const deleteUser = (id) => api.delete(`/users/${id}`);
export const getVideos = () => api.get('/videos');
export const uploadMedia = (formData, onProgress) => api.post('/videos', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  onUploadProgress: onProgress
    ? (e) => onProgress(Math.round((e.loaded * 100) / (e.total || 1)))
    : undefined
});
export const deleteMedia = (id) => api.delete(`/videos/${id}`);
export const reorderVideos = (data) => api.put('/videos/reorder', data);

export const getAdvisorReport = (params) => api.get('/reports/advisor', { params });
export const getRequesterReport = (params) => api.get('/reports/requester', { params });
export const getDailyReport = (params) => api.get('/reports/daily', { params });
export const getLogs = (params) => api.get('/logs', { params });
export const getParameters = () => api.get('/parameters');
export const getTodaySummary = () => api.get('/reports/today');
export const setParameter = (data) => api.post('/parameters', data);
// Config de la pantalla de sala (duración de imágenes). GET público, POST con token.
export const getScreenConfig = () => api.get('/parameters/screen');
export const setScreenConfig = (data) => api.post('/parameters/screen', data);

export default api;
