import { createContext, useContext, useState, type ReactNode } from 'react';
import { authApi, type User } from '../api';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (contact: string, password: string) => Promise<void>;
  register: (data: { name: string; organization: string; contact: string; password: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStoredUser(): User | null {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(loadStoredUser);
  const [loading, setLoading] = useState(false);

  const persist = (token: string, u: User) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
  };

  const login = async (contact: string, password: string) => {
    setLoading(true);
    try {
      const res = await authApi.login({ contact, password });
      persist(res.access_token, res.user);
    } finally {
      setLoading(false);
    }
  };

  const register = async (data: { name: string; organization: string; contact: string; password: string }) => {
    setLoading(true);
    try {
      const res = await authApi.register(data);
      persist(res.access_token, res.user);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
