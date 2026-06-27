import { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QR_MOCKUP } from '@/lib/mockData';
import { ExternalLink } from 'lucide-react';
import { Button } from '../ui/button';
import { setStoredStoreSlug } from '@/lib/storeSlug';
import { useTranslation } from 'react-i18next';
import {
  FRONTEND_OFFLINE_MENU_STORE_SLUG,
  FRONTEND_OFFLINE_MENU_TABLE_ID,
} from '@/lib/frontendOfflineMenu';

export const DemoQRGrid = () => {
  const { t } = useTranslation();
  const offlineMenuUrl = useMemo(() => {
    const origin =
      typeof window !== 'undefined'
        ? window.location.origin.replace(/\/$/, '')
        : ((import.meta.env.VITE_PUBLIC_BASE_ORIGIN as string | undefined)?.trim() || 'http://localhost:5173').replace(/\/$/, '');
    return `${origin}/${FRONTEND_OFFLINE_MENU_TABLE_ID}`;
  }, []);

  return (
    <div className="py-32 bg-gradient-card" data-section="demo-qr">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-20">
          <h2 className="text-6xl md:text-7xl font-black mb-6 text-foreground tracking-tight">
            {t('landing.demo.title', { defaultValue: 'Experience It Live' })}
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-light">
            {t('landing.demo.subtitle', {
              defaultValue:
                'Scan any of the live stores below to jump straight into their real menu. Each code maps to an active table from the seeded locations.',
            })}
          </p>
        </div>

        <div className="mb-20" data-live-qr-anchor>
          <div className="max-w-lg mx-auto">
            <div className="group p-10 text-center bg-card text-card-foreground rounded-3xl border border-border hover:border-primary/60 hover:shadow-2xl transition-all duration-300 h-full flex flex-col hover:-translate-y-2">
              <h3 className="text-2xl font-bold mb-2 text-foreground">
                {t('landing.demo.fallback_title', { defaultValue: 'Offline Menu' })}
              </h3>
              <p className="text-primary font-medium mb-8">
                {t('landing.demo.fallback_subtitle', {
                  defaultValue: 'Frontend-only demo menu stored in the production app',
                })}
              </p>
              <div className="flex-1 flex items-center justify-center mb-8">
                <div className="glass p-6 rounded-3xl border-2 border-border w-[232px] h-[232px] flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                  <QRCodeSVG key={offlineMenuUrl} value={offlineMenuUrl} size={220} level="H" includeMargin={false} />
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full gap-2 mt-auto rounded-2xl py-6 hover:border-primary hover:bg-accent/30 transition-all text-foreground"
                onClick={() => {
                  try {
                    setStoredStoreSlug(FRONTEND_OFFLINE_MENU_STORE_SLUG);
                  } catch (error) {
                    console.warn("Failed to persist offline STORE_SLUG from landing", error);
                  }
                  console.log("[DemoQRGrid] frontend offline menu click", {
                    offlineMenuUrl,
                    host: typeof window !== "undefined" ? window.location.origin : "ssr",
                  });
                  window.location.assign(offlineMenuUrl);
                }}
              >
                <ExternalLink className="h-4 w-4" />
                {t('landing.demo.open_live_table', {
                  defaultValue: 'Open Offline Menu',
                })}
              </Button>
            </div>
          </div>
        </div>

        <div className="relative max-w-5xl mx-auto">
          <div className="absolute -inset-8 bg-gradient-primary rounded-[2.5rem] blur-3xl opacity-30 animate-glow" />
          <img
            src={QR_MOCKUP}
            alt={t('landing.demo.mockup_alt', { defaultValue: 'QR ordering mockup' })}
            loading="lazy"
            className="relative rounded-3xl shadow-2xl ring-1 ring-gray-200 hover:scale-[1.02] transition-transform duration-500"
          />
        </div>
      </div>
    </div>
  );
};
