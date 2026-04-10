import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface User {
  email: string;
  name?: string;
  picture?: string;
  role?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
}

const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN ?? "https://sheets-api-production-0097.up.railway.app")
  .trim()
  .replace(/\/+$/, '');

function apiUrl(path: string) {
  if (!path.startsWith("/")) path = `/${path}`;
  return `${API_ORIGIN}${path}`;
}

const fetchOptionsBase: RequestInit = { credentials: "include" as RequestCredentials };

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSession = useCallback(async () => {
    try {
      setIsLoading(true);

      // 1. Tenta pegar token da URL (fallback cross-site)
      const hash = window.location.hash;
      let token = sessionStorage.getItem("auth_token") || "";
      
      if (hash.startsWith("#token=")) {
        token = hash.split("token=")[1];
        sessionStorage.setItem("auth_token", token);
        // Limpa a URL para estética/segurança
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }

      // 2. Prepara headers (se tiver token, usa Bearer)
      const options: RequestInit = { ...fetchOptionsBase };
      if (token) {
        options.headers = {
          ...options.headers,
          "Authorization": `Bearer ${token}`
        };
      }

      const res = await fetch(apiUrl("/auth/me"), options);
      if (res.ok) {
        const data = await res.json();
        // O novo formato é { success: true, user: { email: ... } }
        setUser(data.user || data);
      } else {
        if (res.status === 401) {
          console.warn("[Auth] Sessão inválida ou expirada (401)");
        }
        setUser(null);
      }
    } catch (error) {
      console.error('Failed to get user session:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const login = useCallback(() => {
    // Redireciona para o Gateway API que lidará com o OAuth
    window.location.href = `${API_ORIGIN}/auth/login?redirect=${encodeURIComponent(window.location.origin)}`;
  }, []);

  const logout = useCallback(() => {
    // Agora o logout também é um redirecionamento para limpar a sessão no servidor
    window.location.href = `${API_ORIGIN}/auth/logout?redirect=${encodeURIComponent(window.location.origin)}`;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
