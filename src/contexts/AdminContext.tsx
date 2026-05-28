"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";

interface AdminContextValue {
  isAdmin: boolean;
  token: string | null;
  showLoginModal: boolean;
  login: (password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  closeLoginModal: () => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within AdminProvider");
  return ctx;
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("admin") === "1") {
      const stored = localStorage.getItem("admin_token");
      if (stored) {
        setToken(stored);
      } else {
        setShowLoginModal(true);
      }
    }
  }, []);

  const login = useCallback(async (password: string) => {
    try {
      const res = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json();
        return { success: false, error: data.error || "登录失败" };
      }
      const { token: newToken } = await res.json();
      localStorage.setItem("admin_token", newToken);
      setToken(newToken);
      setShowLoginModal(false);
      return { success: true };
    } catch {
      return { success: false, error: "网络错误" };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("admin_token");
    setToken(null);
  }, []);

  const closeLoginModal = useCallback(() => setShowLoginModal(false), []);

  return (
    <AdminContext.Provider value={{ isAdmin: !!token, token, showLoginModal, login, logout, closeLoginModal }}>
      {children}
    </AdminContext.Provider>
  );
}
