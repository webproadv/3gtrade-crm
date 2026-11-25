import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';
import type { Me, Module } from './types';

interface Session {
  me: Me | null;
  modules: Module[];
  loading: boolean;
  login: (tenant: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  reload: () => Promise<void>;
  module: (name: string) => Module | undefined;
}

const Ctx = createContext<Session>(null as unknown as Session);
export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    setMe(null);
    setModules([]);
  }, []);

  const reload = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const [m, mods] = await Promise.all([api<Me>('/auth/me'), api<Module[]>('/modules')]);
      setMe(m);
      setModules(mods);
    } catch {
      logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    void reload();
  }, [reload, logout]);

  const login = async (tenant: string, email: string, password: string) => {
    const r = await api<{ accessToken: string }>('/auth/login', { method: 'POST', body: { tenant, email, password } });
    setToken(r.accessToken);
    await reload();
  };

  return (
    <Ctx.Provider
      value={{ me, modules, loading, login, logout, reload, module: (n) => modules.find((m) => m.name === n) }}
    >
      {children}
    </Ctx.Provider>
  );
}
