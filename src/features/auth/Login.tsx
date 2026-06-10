import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, LockKeyhole, ShieldCheck, Store, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useAuthStore } from "@/store/authStore";
import { api, ApiError } from "@/lib/api";
import { formatStoreSlugLabel, setStoredStoreSlug } from "@/lib/storeSlug";

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [currentPasswordForChange, setCurrentPasswordForChange] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError("");
      setLoading(true);
      const { accessToken, user, store } = await api.signIn(email, password);
      const enrichedUser = {
        ...user,
        storeId: user.storeId || store?.id,
        storeSlug: user.storeSlug || store?.slug || user.storeSlug,
      };
      const loginStoreSlug = enrichedUser.storeSlug || store?.slug || "";
      if (loginStoreSlug) {
        try {
          setStoredStoreSlug(loginStoreSlug);
          window.dispatchEvent(
            new CustomEvent("store-slug-changed", { detail: { slug: loginStoreSlug } })
          );
        } catch (error) {
          console.warn("Failed to persist store slug on login", error);
        }
      }
      try {
        const loginStoreName = store?.name || formatStoreSlugLabel(loginStoreSlug);
        if (loginStoreName) localStorage.setItem("STORE_NAME", loginStoreName);
        else localStorage.removeItem("STORE_NAME");
      } catch (error) {
        console.warn("Failed to persist store name on login", error);
      }
      login(enrichedUser, accessToken);
      if (enrichedUser.mustChangePassword) {
        setCurrentPasswordForChange(password);
        setMustChangePassword(true);
        setPassword("");
        return;
      }
      if (enrichedUser.role === "architect") navigate("/GarsoneAdmin");
      else if (enrichedUser.role === "manager") navigate("/manager");
      else if (enrichedUser.role === "cook") navigate("/cook");
      else navigate("/waiter");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError(t("auth.invalid_credentials"));
        } else if (err.status === 0) {
          setError(t("auth.network_error"));
        } else {
          setError(err.message || t("auth.login_failed"));
        }
      } else {
        setError(t("auth.login_failed"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError(t("auth.password_min"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("auth.password_mismatch"));
      return;
    }
    try {
      setError("");
      setLoading(true);
      await api.changePassword(currentPasswordForChange, newPassword);
      updateUser({ mustChangePassword: false });
      const user = useAuthStore.getState().user;
      if (user?.role === "architect") navigate("/GarsoneAdmin");
      else if (user?.role === "manager") navigate("/manager");
      else if (user?.role === "cook") navigate("/cook");
      else navigate("/waiter");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message || t("auth.password_change_failed"));
      else setError(t("auth.password_change_failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-muted/30 text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl items-center px-4 py-8 sm:px-6 lg:px-8">
        <Card
          interactive={false}
          className="w-full overflow-hidden border-border/70 bg-card shadow-xl"
        >
          <div className="grid min-h-[620px] lg:grid-cols-[0.95fr_1.05fr]">
            <aside className="hidden bg-neutral-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
              <div>
                <Link
                  to="/"
                  className="inline-flex items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  aria-label="Garsone home"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white">
                    <img src="/Garsone_Favicon.svg" alt="" className="h-7 w-7" />
                  </span>
                  <span className="text-xl font-bold tracking-tight">Garsone</span>
                </Link>

                <div className="mt-14 max-w-sm">
                  <p className="mb-3 inline-flex rounded-full border border-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/70">
                    {t("auth.secure_area")}
                  </p>
                  <h1 className="text-4xl font-bold leading-tight tracking-tight">
                    {t("auth.brand_panel_title")}
                  </h1>
                  <p className="mt-4 text-base leading-7 text-white/70">
                    {t("auth.brand_panel_desc")}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <Store className="mt-0.5 h-5 w-5 text-white/80" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">{t("auth.role_based")}</p>
                    <p className="mt-1 text-sm leading-6 text-white/60">
                      {t("auth.role_based_desc")}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <Wifi className="mt-0.5 h-5 w-5 text-white/80" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">{t("auth.realtime")}</p>
                    <p className="mt-1 text-sm leading-6 text-white/60">
                      {t("auth.realtime_desc")}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-white/80" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">{t("auth.protected_dashboard")}</p>
                    <p className="mt-1 text-sm leading-6 text-white/60">
                      {t("auth.protected_dashboard_desc")}
                    </p>
                  </div>
                </div>
              </div>
            </aside>

            <main className="flex flex-col justify-center px-6 py-8 sm:px-10 lg:px-14">
              <div className="mx-auto w-full max-w-md">
                <Link
                  to="/"
                  className="mb-8 inline-flex items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
                  aria-label="Garsone home"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background">
                    <img src="/Garsone_Favicon.svg" alt="" className="h-6 w-6" />
                  </span>
                  <span className="text-lg font-bold tracking-tight">Garsone</span>
                </Link>

                <div className="mb-8 flex items-center justify-between gap-4">
                  <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-semibold text-muted-foreground">
                    <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("auth.secure_area")}
                  </span>
                  <Link
                    to="/"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    {t("auth.back_to_home")}
                  </Link>
                </div>

                <div className="mb-8">
                  <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                    {mustChangePassword
                      ? t("auth.password_reset_title")
                      : t("auth.staff_access_title")}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {mustChangePassword
                      ? t("auth.password_reset_description")
                      : t("auth.staff_access_subtitle")}
                  </p>
                </div>

                {mustChangePassword ? (
                  <form onSubmit={handlePasswordChange} className="space-y-5">
                    {error && (
                      <div
                        role="alert"
                        aria-live="polite"
                        className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
                      >
                        {error}
                      </div>
                    )}
                    <div>
                      <label className="mb-2 block text-sm font-semibold">
                        {t("auth.new_password")}
                      </label>
                      <Input
                        type="password"
                        value={newPassword}
                        onChange={(e) => {
                          setNewPassword(e.target.value);
                          if (error) setError("");
                        }}
                        className="h-12 rounded-lg"
                        autoComplete="new-password"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold">
                        {t("auth.confirm_password")}
                      </label>
                      <Input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          if (error) setError("");
                        }}
                        className="h-12 rounded-lg"
                        autoComplete="new-password"
                        required
                      />
                    </div>
                    <Button type="submit" className="h-12 w-full rounded-lg text-base" disabled={loading}>
                      {loading ? t("auth.updating") : t("auth.set_password")}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5">
                    {error && (
                      <div
                        role="alert"
                        aria-live="polite"
                        className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
                      >
                        {error}
                      </div>
                    )}
                    <div>
                      <label className="mb-2 block text-sm font-semibold">
                        {t("auth.email")}
                      </label>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (error) setError("");
                        }}
                        placeholder={t("auth.email_placeholder")}
                        className="h-12 rounded-lg"
                        autoComplete="email"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold">
                        {t("auth.password")}
                      </label>
                      <Input
                        type="password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (error) setError("");
                        }}
                        placeholder={t("auth.password_placeholder")}
                        className="h-12 rounded-lg"
                        autoComplete="current-password"
                        required
                      />
                    </div>
                    <Button type="submit" className="h-12 w-full rounded-lg text-base" disabled={loading}>
                      {loading ? t("auth.signing_in") : t("auth.sign_in")}
                    </Button>
                  </form>
                )}
              </div>
            </main>
          </div>
        </Card>
      </div>
    </div>
  );
}
