'use client';
import React, { createContext, useContext } from "react";
import type { ProfileFormData } from "@/components/bank/AuthView";

interface AppContextValue {
  authUid: string | null;
  dashboardName: string;
  loginEmail: string;
  registerData: {
    prenom: string;
    nom: string;
    email: string;
    phone: string;
    password: string;
    pseudo: string;
  };
  profileForm: ProfileFormData;
  firestoreBalance: number | null;
  showToast: (msg: string) => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: AppContextValue;
}) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppProvider");
  return ctx;
}

export default AppContext;
