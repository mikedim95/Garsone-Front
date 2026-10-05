import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { billingApi } from "@/lib/billingApi";
import { realtimeService } from "@/lib/realtime";
import { useAuthStore } from "@/store/authStore";

export function useBillingVisits(closed = false) {
  const { user, token } = useAuthStore();
  const allowed = Boolean(token && user && ["manager", "architect", "waiter", "hybrid"].includes(user.role));
  const query = useQuery({
    queryKey: ["billing-visits", user?.storeSlug, user?.id, closed],
    queryFn: ({ signal }) => billingApi.list(closed, signal),
    enabled: allowed,
    retry: false,
    refetchInterval: 15_000,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    networkMode: "always",
  });
  const { refetch } = query;
  useEffect(() => {
    if (!allowed || !user?.storeSlug) return;
    const topic = `${user.storeSlug}/billing/updated`;
    const refresh = () => { void refetch(); };
    const status = (event: Event) => { if ((event as CustomEvent<{ connected: boolean }>).detail?.connected) refresh(); };
    void realtimeService.connect();
    realtimeService.subscribe(topic, refresh);
    window.addEventListener("realtime-status", status);
    return () => {
      realtimeService.unsubscribe(topic, refresh);
      window.removeEventListener("realtime-status", status);
    };
  }, [allowed, user?.storeSlug, refetch]);
  return query;
}
