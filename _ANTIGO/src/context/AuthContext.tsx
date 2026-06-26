import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface User {
  email: string;
  name: string;
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

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "https://bigou-sheets-api.netlify.app";

function apiUrl(path: string) {
  if (!path.startsWith("/")) path = `/${path}`;
  return `${API_ORIGIN}${path}`;
}

const fetchOptions: RequestInit = { credentials: "include" as RequestCredentials };

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
      const res = await fetch(apiUrl("/auth/me"), fetchOptions);
      if (res.ok) {
        const data = await res.json();
        setUser(data.user || data); // Dependendo do backend, pode ser req.user ou {user: ...}
      } else {
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

  const logout = useCallback(async () => {
    try {
      // Opcional: Chama endpoint de logout caso o gateway o possua
      await fetch(apiUrl("/auth/logout"), { method: 'POST', ...fetchOptions }).catch(() => {});
    } catch (e) {
      console.error(e);
    }
    setUser(null);
    // Removemos state do frontend e podemos também redirecionar para endpoint GET logout se necessário
    // window.location.href = `${API_ORIGIN}/auth/logout?redirect=${encodeURIComponent(window.location.origin)}`;
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
