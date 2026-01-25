import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QR_MOCKUP } from '@/lib/mockData';
import { ExternalLink } from 'lucide-react';
import { Button } from '../ui/button';
import { api, API_BASE } from '@/lib/api';
import type { LandingStoreLink } from '@/types';
import { setStoredStoreSlug } from '@/lib/storeSlug';

type DemoQRGridProps = {
  liveUrl?: string | null;
};

export const DemoQRGrid = ({ liveUrl: providedLiveUrl }: DemoQRGridProps) => {
  const [liveUrl, setLiveUrl] = useState<string | null>(providedLiveUrl ?? null);
  const [stores, setStores] = useState<LandingStoreLink[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);

  const publicCodeBase = useMemo(() => {
    const envBase = (import.meta.env.VITE_PUBLIC_CODE_BASE as string | undefined)?.trim();
    if (envBase && envBase.length > 0) {
      return envBase.replace(/\/$/, '');
    }
    if (typeof window !== 'undefined') {
      return `${window.location.origin.replace(/\/$/, '')}/publiccode`;
    }
    // SSR fallback: prefer a declared public origin, otherwise default to localhost frontend port
    const originEnv = (import.meta.env.VITE_PUBLIC_BASE_ORIGIN as string | undefined)?.trim();
    const origin = originEnv && originEnv.length > 0 ? originEnv.replace(/\/$/, '') : 'http://localhost:5173';
    return `${origin}/publiccode`;
  }, []);

  const getBaseOrigin = (storeSlug?: string | null) => {
    const envOrigin = import.meta.env.VITE_PUBLIC_BASE_ORIGIN as string | undefined;
    if (envOrigin && envOrigin.trim().length > 0) {
      const normalized = envOrigin.replace(/\/$/, '');
      return normalized.replace('{storeSlug}', storeSlug || '');
    }
    if (typeof window !== 'undefined') {
      const { protocol, hostname, port } = window.location;
      const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
      const isLocal = hostname === 'localhost';
      let host = hostname;
      // Only swap subdomain when we control the wildcard domain (skip on *.onrender.com to avoid 404s)
      const allowSubdomain =
        !hostname.endsWith('onrender.com') &&
        !hostname.endsWith('render.com') &&
        hostname.split('.').length > 2;
      if (storeSlug && !isIp && !isLocal && hostname.includes('.') && allowSubdomain) {
        const parts = hostname.split('.');
        parts[0] = storeSlug;
        host = parts.join('.');
      }
      const portPart = port ? `:${port}` : '';
      return `${protocol}//${host}${portPart}`;
    }
    return 'http://localhost:8080';
  };

  const buildStoreUrl = (store: LandingStoreLink) => {
    if (store.publicCode) {
      return `${publicCodeBase}/${store.publicCode}`;
    }
    if (store.tableId) {
      const origin = getBaseOrigin(store.slug);
      return `${origin}/${store.tableId}`;
    }
    return null;
  };

  useEffect(() => {
    setLiveUrl(providedLiveUrl ?? null);
  }, [providedLiveUrl]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingStores(true);
        const res = await api.getLandingStores();
        if (!mounted) return;
        setStores(res?.stores ?? []);
      } catch (error) {
        console.warn('Failed to fetch landing stores', error);
      } finally {
        if (mounted) setLoadingStores(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (providedLiveUrl) {
      return () => {
        mounted = false;
      };
    }
    (async () => {
      try {
        const data = await api.getTables();
        const actives = (data?.tables || []).filter((t) => t.active);
        if (actives.length > 0) {
          const random = actives[Math.floor(Math.random() * actives.length)];
          if (mounted) setLiveUrl(`${getBaseOrigin()}/${random.id}`);
        }
      } catch (error) {
        console.warn('Failed to fetch tables for DemoQRGrid', error);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [providedLiveUrl]);

  const storeCards = (stores || [])
    .filter((store) =>
      store.slug === 'acropolis-street-food' ||
      store.name?.toLowerCase().includes('acropolis')
    )
    .slice(0, 1);
  const singleCard = storeCards.length === 1;

  return (
    <div className="py-32 bg-gradient-card" data-section="demo-qr">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-20">
          <h2 className="text-6xl md:text-7xl font-black mb-6 text-foreground tracking-tight">
            Experience It Live
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-light">
            Scan any of the live stores below to jump straight into their real menu. Each code maps to an active table from the seeded locations.
          </p>
        </div>

        <div className="mb-20" data-live-qr-anchor>
          {storeCards.length > 0 ? (
            <div
              className={
                singleCard
                  ? 'grid gap-8 place-items-center'
                  : 'grid gap-8 md:grid-cols-2 lg:grid-cols-3'
              }
            >
              {storeCards.map((store) => {
                const qrUrl = buildStoreUrl(store);
                const label = store.tableLabel ? `Table ${store.tableLabel}` : 'Live table';
                return (
                  <div
                    key={store.id}
                    className={`group p-8 text-center bg-card text-card-foreground rounded-3xl border border-border hover:border-primary/60 hover:shadow-2xl transition-all duration-300 h-full flex flex-col hover:-translate-y-2 ${
                      singleCard ? 'w-full max-w-md mx-auto' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h3 className="text-2xl font-bold text-foreground text-left">{store.name}</h3>
                      <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground bg-muted px-3 py-1 rounded-full">
                        {store.slug}
                      </span>
                    </div>
                    <p className="text-primary font-medium mb-6 text-left">{label}</p>
                    <div className="flex-1 flex items-center justify-center mb-6">
                      <div className="glass p-6 rounded-3xl border-2 border-border w-[232px] h-[232px] flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                        {qrUrl ? (
                          <QRCodeSVG key={qrUrl} value={qrUrl} size={220} level="H" includeMargin={false} />
                        ) : (
                          <div className="text-sm text-primary text-center">No active table found</div>
                        )}
                      </div>
                    </div>
                <Button
                  variant="outline"
                  className="w-full gap-2 mt-auto rounded-2xl py-5 hover:border-primary hover:bg-accent/30 transition-all text-foreground"
                  disabled={!qrUrl}
                  onClick={() => {
                    try {
                      setStoredStoreSlug(store.slug || "");
                    } catch (error) {
                      console.warn("Failed to persist STORE_SLUG from landing", error);
                    }
                    console.log("[DemoQRGrid] card click", {
                      store: store.slug,
                      tableId: store.tableId,
                      publicCode: store.publicCode,
                      qrUrl,
                      host: typeof window !== "undefined" ? window.location.origin : "ssr",
                    });
                    if (qrUrl) window.location.assign(qrUrl);
                  }}
                >
                  {qrUrl ? (
                    <>
                      <ExternalLink className="h-4 w-4" />
                      Open menu
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-2 opacity-70">
                      <ExternalLink className="h-4 w-4" />
                      Preparing link
                    </span>
                  )}
                </Button>
              </div>
            );
          })}
            </div>
          ) : (
            <div className="max-w-lg mx-auto">
              <div className="group p-10 text-center bg-card text-card-foreground rounded-3xl border border-border hover:border-primary/60 hover:shadow-2xl transition-all duration-300 h-full flex flex-col hover:-translate-y-2">
                <h3 className="text-2xl font-bold mb-2 text-foreground">Live Store</h3>
                <p className="text-primary font-medium mb-8">Random active table from the real Garsone backend</p>
                <div className="flex-1 flex items-center justify-center mb-8">
                  <div className="glass p-6 rounded-3xl border-2 border-border w-[232px] h-[232px] flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                    {liveUrl ? (
                      <QRCodeSVG key={liveUrl} value={liveUrl} size={220} level="H" includeMargin={false} />
                    ) : (
                      <div className="text-sm text-primary text-center">
                        {loadingStores ? 'Loading stores...' : 'Fetching a table...'}
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full gap-2 mt-auto rounded-2xl py-6 hover:border-primary hover:bg-accent/30 transition-all text-foreground"
                  disabled={!liveUrl}
                  onClick={() => {
                    console.log("[DemoQRGrid] fallback live click", {
                      liveUrl,
                      host: typeof window !== "undefined" ? window.location.origin : "ssr",
                    });
                    if (liveUrl) window.location.assign(liveUrl);
                  }}
                >
                  {liveUrl ? (
                    <>
                      <ExternalLink className="h-4 w-4" />
                      Open Live Table
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-2 opacity-70">
                      <ExternalLink className="h-4 w-4" />
                      Preparing link...
                    </span>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="relative max-w-5xl mx-auto">
          <div className="absolute -inset-8 bg-gradient-primary rounded-[2.5rem] blur-3xl opacity-30 animate-glow" />
          <img
            src={QR_MOCKUP}
            alt="QR in cafe"
            loading="lazy"
            className="relative rounded-3xl shadow-2xl ring-1 ring-gray-200 hover:scale-[1.02] transition-transform duration-500"
          />
        </div>
      </div>
    </div>
  );
};
