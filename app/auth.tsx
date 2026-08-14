"use client";

import { createContext, FormEvent, ReactNode, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole, LogIn, RefreshCw, ShieldCheck } from "lucide-react";
import { ApiError, apiFetch } from "./api-client";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

type AuthContextValue = {
  user: AuthUser;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthGate");
  return value;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "offline">("loading");

  const checkSession = async () => {
    setStatus("loading");
    try {
      const result = await apiFetch<{ user: AuthUser }>("/auth/me");
      setUser(result.user);
      setStatus("ready");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return;
      }
      setStatus("offline");
    }
  };

  useEffect(() => {
    void checkSession();
  }, []);

  if (status === "loading" || !user) {
    return (
      <main className="auth-state-page">
        <section className="auth-state-card">
          {status === "offline" ? <RefreshCw /> : <ShieldCheck className="auth-spinner" />}
          <h1>{status === "offline" ? "API пока недоступен" : "Проверяем доступ"}</h1>
          <p>{status === "offline" ? "Запустите backend и MongoDB, затем повторите попытку." : "Восстанавливаем защищённую сессию VenueFlow."}</p>
          {status === "offline" && <button className="primary" onClick={() => void checkSession()}><RefreshCw /> Повторить</button>}
        </section>
      </main>
    );
  }

  const logout = async () => {
    await apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
    router.replace("/login");
  };

  return <AuthContext.Provider value={{ user, logout }}>{children}</AuthContext.Provider>;
}

export function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ user: AuthUser }>("/auth/me")
      .then(() => router.replace("/overview"))
      .catch(() => undefined);
  }, [router]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch<{ user: AuthUser }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      router.replace("/overview");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <div className="login-logo"><i>VF</i><span><strong>VenueFlow</strong><small>Video intelligence</small></span></div>
        <div><span className="login-kicker">OPERATIONS PLATFORM</span><h1>Управляйте заведениями на основе реальных событий.</h1><p>Локации, планы этажей, зоны и операционная аналитика в одном защищённом пространстве.</p></div>
        <small>VenueFlow · Private workspace</small>
      </section>
      <section className="login-form-panel">
        <form className="login-card" onSubmit={submit}>
          <div className="login-lock"><LockKeyhole /></div>
          <span>ЗАЩИЩЁННЫЙ ВХОД</span>
          <h2>Войти в VenueFlow</h2>
          <p>Используйте рабочий логин и пароль владельца.</p>
          <label>Email<input autoComplete="username" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="owner@venueflow.local" /></label>
          <label>Пароль<div className="login-password"><input autoComplete="current-password" type={showPassword ? "text" : "password"} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Введите пароль" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
          {error && <div className="login-error" role="alert">{error}</div>}
          <button className="primary login-submit" disabled={busy} type="submit">{busy ? <RefreshCw className="auth-spinner" /> : <LogIn />}{busy ? "Входим…" : "Войти"}</button>
        </form>
      </section>
    </main>
  );
}
