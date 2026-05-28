"use client";

import { useState, useRef, useEffect } from "react";
import { useAdmin } from "@/contexts/AdminContext";

export function AdminLoginModal() {
  const { showLoginModal, login, closeLoginModal } = useAdmin();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showLoginModal) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [showLoginModal]);

  if (!showLoginModal) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await login(password);
    if (!result.success) {
      setError(result.error || "登录失败");
      setPassword("");
    }
    setLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") closeLoginModal();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="管理员登录"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm mx-4 bg-card border border-border rounded-2xl p-6 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-foreground mb-1">管理员验证</h2>
        <p className="text-sm text-muted mb-5">请输入管理密码以启用 AI 预测功能</p>

        <input
          ref={inputRef}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="输入密码"
          className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground text-sm placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-highlight/50 focus:border-highlight transition-all duration-150"
          autoComplete="current-password"
        />

        {error && (
          <p className="mt-2 text-xs text-rose-400" role="alert">{error}</p>
        )}

        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={closeLoginModal}
            className="flex-1 py-2.5 rounded-full text-sm font-medium text-muted border border-border hover:bg-card-hover transition-colors duration-150"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={loading || !password}
            className="flex-1 py-2.5 rounded-full text-sm font-medium bg-highlight text-background hover:bg-highlight/90 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "验证中..." : "确认"}
          </button>
        </div>
      </form>
    </div>
  );
}
