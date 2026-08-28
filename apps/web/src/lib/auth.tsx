/**
 * Нэвтрэлтийн контекст — одоогийн хэрэглэгч, нэвтрэх/гарах/нууц үг солих.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@shalgalt/shared';
import { api, ApiError } from './api';

interface AuthValue {
  user: User | null;
  /** Систем дээр админ огт байхгүй — эхний тохиргоо хийх шаардлагатай. */
  needsSetup: boolean;
  loading: boolean;
  /** Сервер хүрэхгүй байна (офлайн). */
  offline: boolean;
  isAdmin: boolean;
  mustChangePassword: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await api.me();
      setUser(response.user);
      setNeedsSetup(response.needsSetup);
      setOffline(false);
    } catch (error) {
      // Офлайн үед хуучин төлвийг хадгална — сурагчийн урсгал тасрахгүй
      if (error instanceof ApiError && error.isOffline) {
        setOffline(true);
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const response = await api.login(username, password);
    setUser(response.user);
    setNeedsSetup(false);
    setOffline(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const response = await api.changePassword(currentPassword, newPassword);
    setUser(response.user);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      needsSetup,
      loading,
      offline,
      isAdmin: user?.role === 'admin',
      mustChangePassword: user?.mustChangePassword ?? false,
      login,
      logout,
      changePassword,
      refresh,
    }),
    [user, needsSetup, loading, offline, login, logout, changePassword, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth нь AuthProvider дотор ашиглагдах ёстой.');
  return context;
}
