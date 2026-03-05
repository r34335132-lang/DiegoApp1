import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import { supabase } from "@/lib/supabase";

interface User {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  role: "entrenador" | "cliente";
  avatar_url?: string;
}

interface RegisterData {
  email: string;
  password: string;
  nombre: string;
  apellido: string;
  role: "entrenador" | "cliente";
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Función auxiliar para buscar los datos extra del usuario en la BD
  const fetchProfile = async (userId: string, email: string) => {
    const { data, error } = await supabase
      .from("perfiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (data) {
      setUser({
        id: userId,
        email: email,
        nombre: data.nombre,
        apellido: data.apellido,
        role: data.rol, 
        avatar_url: data.avatar_url,
      });
    }
  };

  const refreshUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await fetchProfile(session.user.id, session.user.email || "");
    } else {
      setUser(null);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await fetchProfile(session.user.id, session.user.email || "");
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    refreshUser().finally(() => setIsLoading(false));

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  };

  const register = async (formData: RegisterData) => {
    // 1. Crear el usuario en auth
    const { data, error: authError } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
    });

    if (authError) throw new Error(authError.message);
    if (!data.user) throw new Error("Error desconocido al crear el usuario");

    let idDelEntrenador = null;
    let rolFinal = formData.role; // Por defecto es lo que el usuario eligió en la pantalla

    // --- MAGIA APLICADA: Buscar si el correo fue invitado SIN IMPORTAR lo que eligió ---
    const { data: invitacion } = await supabase
      .from("invitaciones")
      .select("entrenador_id")
      .eq("email", formData.email)
      .eq("estado", "pendiente")
      .maybeSingle(); 

    // Si encontramos una invitación, ignoramos el botón de la pantalla y lo forzamos a ser tu cliente
    if (invitacion) {
      idDelEntrenador = invitacion.entrenador_id;
      rolFinal = "cliente"; 

      await supabase
        .from("invitaciones")
        .update({ estado: "aceptada" })
        .eq("email", formData.email);
    }
    // -----------------------------------------------------------------------------------

    // 2. Guardar en la tabla de perfiles
    const { error: dbError } = await supabase.from("perfiles").insert([
      {
        id: data.user.id,
        email: formData.email,
        nombre: formData.nombre,
        apellido: formData.apellido,
        rol: rolFinal, // <--- Guardamos el rol correcto
        entrenador_id: idDelEntrenador, 
      }
    ]);

    if (dbError) throw new Error("Error de base de datos: " + dbError.message);

    // 3. Forzamos la actualización local para que entre a la app inmediatamente con el rol correcto
    setUser({
      id: data.user.id,
      email: formData.email,
      nombre: formData.nombre,
      apellido: formData.apellido,
      role: rolFinal as "entrenador" | "cliente"
    });
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
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