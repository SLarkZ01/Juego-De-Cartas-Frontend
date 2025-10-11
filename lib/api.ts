import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type { ErrorResponse } from '@/types/api';

// Configuración base de la API
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

// Crear instancia de axios con configuración base
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Importante para CORS con autenticación
  timeout: 10000,
});

// ============================================================================
// Interceptor de Request - Añadir token JWT
// ============================================================================
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Solo intentar obtener token en el cliente
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ============================================================================
// Interceptor de Response - Manejar errores de autenticación
// ============================================================================
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ErrorResponse>) => {
    // Manejar error 401 (no autenticado)
    if (error.response?.status === 401) {
      // Limpiar datos de autenticación
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        
        // Redirigir a login solo si no estamos ya en una ruta de auth
        if (!window.location.pathname.includes('/login') && 
            !window.location.pathname.includes('/register')) {
          window.location.href = '/login';
        }
      }
    }

    // Propagar el error con información más clara
    const errorMessage = error.response?.data?.message || 
                        error.message || 
                        'Error desconocido';
    
    return Promise.reject(new Error(errorMessage));
  }
);

export default api;
