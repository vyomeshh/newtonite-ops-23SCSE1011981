import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../api/client';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  switchUser: (email: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const DEMO_ACCOUNTS = [
  { email: 'admin@newtonite.io', name: 'Alice Admin', role: 'ADMIN (All Teams)' },
  { email: 'lead.platform@newtonite.io', name: 'Bob Lead', role: 'LEAD (Platform Eng)' },
  { email: 'member.platform@newtonite.io', name: 'Eve Member', role: 'MEMBER (Platform Eng)' },
  { email: 'viewer.platform@newtonite.io', name: 'Ivy Viewer', role: 'VIEWER (Platform Eng)' },
  { email: 'lead.payments@newtonite.io', name: 'Carol Lead', role: 'LEAD (Payments & Risk)' },
  { email: 'member.custops@newtonite.io', name: 'Hank Member', role: 'MEMBER (Customer Ops)' },
];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchUser = async () => {
    try {
      const me = await authApi.getMe();
      setUser(me);
    } catch {
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchUser();
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const data = await authApi.login(email, password);
      localStorage.setItem('token', data.access_token);
      setToken(data.access_token);
      const me = await authApi.getMe();
      setUser(me);
    } finally {
      setIsLoading(false);
    }
  };

  const switchUser = async (email: string) => {
    await login(email, 'newtonite123');
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    if (token) {
      await fetchUser();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        switchUser,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
