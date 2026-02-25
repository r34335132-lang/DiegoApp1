import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetch } from "expo/fetch";
import { getApiUrl } from "@/lib/query-client";

interface User {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  role: "entrenador" | "cliente";
  avatar_url?: string;
  created_at?: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User) => void;
}

interface RegisterData {
  email: string;
  password: string;
  nombre: string;
  apellido: string;
  role: "entrenador" | "cliente";
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function apiFetch(path: string, options?: RequestInit) {
  const base = getApiUrl();
  const url = new URL(path, base).toString();
  return fetch(url, { ...options, credentials: "include" });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const res = await apiFetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        await AsyncStorage.setItem("user", JSON.stringify(data.user));
      } else {
        setUser(null);
        await AsyncStorage.removeItem("user");
      }
    } catch {
      const cached = await AsyncStorage.getItem("user");
      if (cached) {
        try {
          setUser(JSON.parse(cached));
        } catch {}
      }
    }
  };

  useEffect(() => {
    const init = async () => {
      const cached = await AsyncStorage.getItem("user");
      if (cached) {
        try {
          setUser(JSON.parse(cached));
        } catch {}
      }
      await refreshUser();
      setIsLoading(false);
    };
    init();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Error al iniciar sesión");
    setUser(data.user);
    await AsyncStorage.setItem("user", JSON.stringify(data.user));
  };

  const register = async (formData: RegisterData) => {
    const res = await apiFetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Error al registrar");
    setUser(data.user);
    await AsyncStorage.setItem("user", JSON.stringify(data.user));
  };

  const logout = async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {}
    setUser(null);
    await AsyncStorage.removeItem("user");
  };

  const value = useMemo(
    () => ({ user, isLoading, login, register, logout, refreshUser, setUser }),
    [user, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
