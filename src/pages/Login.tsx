import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useAuthStore } from "@/store/authStore";
import { api, ApiError } from "@/lib/api";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { HomeLink } from "@/components/HomeLink";

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  // Show dummy login choices instantly when Offline is toggled
  const envDebug =
    String((import.meta as any).env?.VITE_ENABLE_DEBUG_LOGIN || "").toLowerCase() ===
    "true";
  const [offline, setOffline] = useState<boolean>(() => {
    try {
      return localStorage.getItem("OFFLINE") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const onMqttStatus = (e: any) => {
      const connected = Boolean(e?.detail?.connected);
      setOffline(!connected);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === "OFFLINE") {
        setOffline(e.newValue === "1");
      }
    };
    window.addEventListener("mqtt-status", onMqttStatus as any);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("mqtt-status", onMqttStatus as any);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const debugEnabled = offline || envDebug;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError("");
      setLoading(true);
      const { accessToken, user } = await api.signIn(email, password);
      login(user, accessToken);
      if (user.role === "manager") navigate("/manager");
      else if (user.role === "cook") navigate("/cook");
      else navigate("/waiter");
    } catch (err: any) {
      if (err instanceof ApiError) {
        if (err.status === 401) setError("Invalid email or password.");
        else if (err.status === 0) setError("Cannot reach server. Check network or server status.");
        else setError(err.message || "Login failed.");
      } else {
        setError("Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center p-4">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            const next = !offline;
            try { localStorage.setItem('OFFLINE', next ? '1' : '0'); } catch {}
            setOffline(next);
            try { window.dispatchEvent(new CustomEvent('mqtt-status', { detail: { connected: !next } })); } catch {}
          }}
          title={(offline ? 'Offline' : 'Connected') + ' — click to ' + (offline ? 'go online' : 'go offline')}
          className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-xs font-medium text-foreground/80 hover:bg-accent/50 transition-colors"
        >
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${offline ? 'bg-amber-500' : 'bg-green-500'}`} />
          {offline ? 'Offline' : 'Connected'}
        </button>
        <LanguageSwitcher />
        <HomeLink />
      </div>
      <Card className="w-full max-w-md p-8">
        <h1 className="text-3xl font-bold mb-6 text-center">
          {t("auth.login")}
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div role="alert" aria-live="polite" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-2">
              {t("auth.email")}
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }}
              placeholder="waiter1@demo.local"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              {t("auth.password")}
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (error) setError(""); }}
              placeholder="changeme"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : t("auth.sign_in")}
          </Button>
        </form>
        <p className="mt-4 text-sm text-gray-500 text-center">
          Demo: waiter1@demo.local / manager@demo.local
        </p>

        {debugEnabled && (
          <div className="mt-6 pt-6 border-t">
            <p className="text-xs text-gray-400 mb-3 text-center">
              Debug login (no backend)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  login(
                    {
                      id: "debug-waiter",
                      email: "waiter@debug",
                      role: "waiter",
                      displayName: "Debug Waiter",
                    },
                    "debug-token"
                  );
                  navigate("/waiter");
                }}
              >
                Waiter
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  login(
                    {
                      id: "debug-cook",
                      email: "cook@debug",
                      role: "cook",
                      displayName: "Debug Cook",
                    },
                    "debug-token"
                  );
                  navigate("/cook");
                }}
              >
                Cook
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  login(
                    {
                      id: "debug-manager",
                      email: "manager@debug",
                      role: "manager",
                      displayName: "Debug Manager",
                    },
                    "debug-token"
                  );
                  navigate("/manager");
                }}
              >
                Manager
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-center text-gray-400">
              This bypasses API auth and may show empty data if backend is
              offline.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
