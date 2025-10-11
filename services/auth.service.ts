import api from '@/lib/api';
import type {
  RegisterRequest,
  LoginRequest,
  AuthResponse,
} from '@/types/api';

/**
 * Servicio de Autenticación
 * Maneja todas las operaciones relacionadas con autenticación de usuarios
 * Responsabilidad única: Autenticación y manejo de sesión
 */
export class AuthService {
  private static readonly TOKEN_KEY = 'token';
  private static readonly USER_KEY = 'user';

  /**
   * Registrar nuevo usuario
   */
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/auth/register', data);
    this.saveAuthData(response.data);
    return response.data;
  }

  /**
   * Iniciar sesión
   */
  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/auth/login', data);
    this.saveAuthData(response.data);
    return response.data;
  }

  /**
   * Cerrar sesión
   */
  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      // Ignorar errores del servidor, limpiar estado local de todas formas
      console.warn('Error en logout del servidor:', error);
    } finally {
      this.clearAuthData();
    }
  }

  /**
   * Obtener usuario actual
   */
  getCurrentUser(): AuthResponse | null {
    if (typeof window === 'undefined') return null;
    
    const userStr = localStorage.getItem(AuthService.USER_KEY);
    if (!userStr) return null;

    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }

  /**
   * Obtener token actual
   */
  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(AuthService.TOKEN_KEY);
  }

  /**
   * Verificar si el usuario está autenticado
   */
  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  /**
   * Guardar datos de autenticación
   */
  private saveAuthData(authData: AuthResponse): void {
    if (typeof window === 'undefined') return;
    
    // Guardar en localStorage
    localStorage.setItem(AuthService.TOKEN_KEY, authData.token);
    localStorage.setItem(AuthService.USER_KEY, JSON.stringify(authData));
    
    // Guardar también en cookies para el middleware
    // Cookie expira en 7 días
    const expirationDays = 7;
    const date = new Date();
    date.setTime(date.getTime() + (expirationDays * 24 * 60 * 60 * 1000));
    const expires = `expires=${date.toUTCString()}`;
    
    document.cookie = `token=${authData.token}; ${expires}; path=/; SameSite=Lax`;
  }

  /**
   * Limpiar datos de autenticación
   */
  private clearAuthData(): void {
    if (typeof window === 'undefined') return;
    
    // Limpiar localStorage
    localStorage.removeItem(AuthService.TOKEN_KEY);
    localStorage.removeItem(AuthService.USER_KEY);
    
    // Limpiar cookie (establecer fecha de expiración en el pasado)
    document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax';
  }
}

// Exportar instancia singleton
export const authService = new AuthService();
