import React, { useState, useEffect } from 'react';
import type { User, AuthResponse } from '../types';
import { authApi } from '../api';
import { AuthContext } from './AuthContextBase';

const getInitialToken = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem('authToken');
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(getInitialToken);
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(getInitialToken()));

  useEffect(() => {
    if (!token) {
      return;
    }

    let isCancelled = false;

    authApi
      .getCurrentUser()
      .then((userData) => {
        if (!isCancelled) {
          setUser(userData);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          localStorage.removeItem('authToken');
          setToken(null);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [token]);

  const login = async (email: string, password: string) => {
    const response: AuthResponse = await authApi.login({ email, password });
    setUser(response.user);
    setToken(response.token);
    localStorage.setItem('authToken', response.token);
    setIsLoading(false);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('authToken');
    setIsLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};
