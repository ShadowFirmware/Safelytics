import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { log } from '../utils/logger';

type Role = 'user' | 'merchant' | null;

interface AuthContextType {
  token: string | null;
  role: Role;
  userId: string | null;
  isLoading: boolean;
  login: (token: string, role: string, id: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token,   setToken]   = useState<string | null>(null);
  const [role,    setRole]    = useState<Role>(null);
  const [userId,  setUserId]  = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      log.action('Auth', 'Restaurando sesión desde SecureStore…');
      const [t, r, i] = await Promise.all([
        SecureStore.getItemAsync('token'),
        SecureStore.getItemAsync('role'),
        SecureStore.getItemAsync('userId'),
      ]);
      setToken(t);
      setRole(r as Role);
      setUserId(i);
      if (t) {
        log.action('Auth', 'Sesión encontrada', { role: r, userId: i });
      } else {
        log.action('Auth', 'Sin sesión guardada');
      }
      setLoading(false);
    })();
  }, []);

  const login = async (t: string, r: string, i: string) => {
    log.action('Auth', 'Guardando sesión', { role: r, userId: i });
    await Promise.all([
      SecureStore.setItemAsync('token',  t),
      SecureStore.setItemAsync('role',   r),
      SecureStore.setItemAsync('userId', i),
    ]);
    setToken(t);
    setRole(r as Role);
    setUserId(i);
  };

  const logout = async () => {
    log.action('Auth', 'Cerrando sesión');
    await Promise.all([
      SecureStore.deleteItemAsync('token'),
      SecureStore.deleteItemAsync('role'),
      SecureStore.deleteItemAsync('userId'),
    ]);
    setToken(null);
    setRole(null);
    setUserId(null);
  };

  return (
    <AuthContext.Provider value={{ token, role, userId, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
