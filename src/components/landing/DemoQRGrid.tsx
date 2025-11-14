import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Card } from '../ui/card';
import { QR_MOCKUP } from '@/lib/mockData';
import { ExternalLink, Smartphone } from 'lucide-react';
import { Button } from '../ui/button';
import { api } from '@/lib/api';

export const DemoQRGrid = () => {
  const getBaseOrigin = () => {
    const envOrigin = (import.meta as any).env?.VITE_PUBLIC_BASE_ORIGIN as
      | string
      | undefined;
    if (envOrigin && envOrigin.trim().length > 0) {
      return envOrigin.replace(/\/$/, "");
    }
    if (typeof window !== "undefined") {
      const { protocol, hostname, port } = window.location;
      const portPart = port ? `:${port}` : "";
      return `${protocol}//${hostname}${portPart}`;
    }
    return "http://localhost:8080";
  };

  const BASE_ORIGIN = getBaseOrigin();
  const [liveUrl, setLiveUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = (await api.getTables()) as any;
        const actives = (data?.tables || []).filter((t: any) => t.active);
        if (actives.length > 0) {
          const random = actives[Math.floor(Math.random() * actives.length)];
          if (mounted) setLiveUrl(`${BASE_ORIGIN}/table/${random.id}`);
        }
      } catch (e) {
        // Fallback silently; keep demo links
      }
    })();
    return () => { mounted = false; };
  }, []);

  const cards: Array<{ key: string; name: string; desc: string; link: string | null; ready?: boolean }> = [
    { key: 'demo-cafe', name: 'Demo Café', desc: 'Coffee & Pastries', link: `${BASE_ORIGIN}/demo/store/demo-cafe`, ready: true },
    { key: 'live-store', name: 'Live Store', desc: 'Random Table (Real Backend)', link: liveUrl, ready: !!liveUrl },
    { key: 'demo-bar', name: 'Demo Bar', desc: 'Cocktails & Drinks', link: `${BASE_ORIGIN}/demo/store/demo-bar`, ready: true },
  ];

  return (
    <div id="demo-qr" className="py-32 bg-gradient-to-b from-gray-50/50 to-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 glass px-5 py-2.5 rounded-full mb-8 shadow-lg">
            <Smartphone className="h-4 w-4 text-purple-600" />
            <span className="text-gray-700 text-sm font-medium">Scan with your phone camera</span>
          </div>
          <h2 className="text-6xl md:text-7xl font-black mb-6 text-gray-900 tracking-tight">
            Experience It Live
          </h2>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto font-light">
            Scan these QR codes to see how customers order from their phones. No app download required!
          </p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8 mb-20 items-stretch">
          {cards.map((card) => (
            <div 
              key={card.key} 
              className="group p-10 text-center bg-white rounded-3xl border border-gray-100 hover:border-purple-200 hover:shadow-2xl transition-all duration-300 h-full flex flex-col hover:-translate-y-2"
            >
              <h3 className="text-2xl font-bold mb-2 text-gray-900">{card.name}</h3>
              <p className="text-purple-600 font-medium mb-8">{card.desc}</p>
              <div className="flex-1 flex items-center justify-center mb-8">
                <div className="glass p-6 rounded-3xl border-2 border-purple-100 w-[232px] h-[232px] flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                  {card.link ? (
                    <QRCodeSVG key={card.link} value={card.link} size={220} level="H" includeMargin={false} />
                  ) : (
                    <div className="text-sm text-purple-500 text-center">Fetching a table…</div>
                  )}
                </div>
              </div>
              <Button
                asChild={!!card.link}
                variant="outline"
                className="w-full gap-2 mt-auto rounded-2xl py-6 hover:bg-purple-50 hover:border-purple-600 transition-all"
                disabled={!card.link}
                onClick={!card.link ? undefined : undefined}
              >
                {card.link ? (
                  <a href={card.link} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Open Demo
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-2 opacity-70">
                    <ExternalLink className="h-4 w-4" />
                    Open Demo
                  </span>
                )}
              </Button>
            </div>
          ))}
        </div>

        <div className="relative max-w-5xl mx-auto">
          <div className="absolute -inset-8 bg-gradient-to-r from-purple-400 via-blue-400 to-purple-400 rounded-[2.5rem] blur-3xl opacity-30 animate-glow" />
          <img 
            src={QR_MOCKUP} 
            alt="QR in cafe" 
            className="relative rounded-3xl shadow-2xl ring-1 ring-gray-200 hover:scale-[1.02] transition-transform duration-500" 
          />
        </div>
      </div>
    </div>
  );
};
