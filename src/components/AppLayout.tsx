import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Hero } from './landing/Hero';
import { Navigation } from './landing/Navigation';
import { AnimatedMockup } from './landing/AnimatedMockup';
import { Features } from './landing/Features';
import { Testimonials } from './landing/Testimonials';
import { DemoQRGrid } from './landing/DemoQRGrid';
import { realtimeService } from '@/lib/realtime';
import { api } from '@/lib/api';
import { useNavigate } from 'react-router-dom';

const DeferredSection: React.FC<{
  children: React.ReactNode;
  rootMargin?: string;
  forceVisible?: boolean;
  onVisible?: () => void;
  placeholderHeight?: number;
}> = ({ children, placeholderHeight }) => {
  return <div style={placeholderHeight ? { minHeight: placeholderHeight } : undefined}>{children}</div>;
};

declare global {
  interface Window {
    __OF_LANDING__?: boolean;
  }
}

const AppLayout: React.FC = () => {
  const demoRef = useRef<HTMLDivElement | null>(null);
  const [forceDemoVisible, setForceDemoVisible] = useState(false);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const navigate = useNavigate();

  const setOfflineFlag = (enabled: boolean) => {
    try {
      localStorage.setItem('OFFLINE', enabled ? '1' : '0');
    } catch (error) {
      console.warn('Failed to toggle OFFLINE flag', error);
    }
  };

  const getBaseOrigin = () => {
    const envOrigin = import.meta.env.VITE_PUBLIC_BASE_ORIGIN;
    if (envOrigin && envOrigin.trim().length > 0) {
      return envOrigin.replace(/\/$/, '');
    }
    if (typeof window !== 'undefined') {
      const { protocol, hostname, port } = window.location;
      const portPart = port ? `:${port}` : '';
      return `${protocol}//${hostname}${portPart}`;
    }
    return 'http://localhost:8080';
  };

  const fetchLiveUrl = useCallback(
    async (opts?: { forceOnline?: boolean }) => {
      setLiveLoading(true);
      if (opts?.forceOnline) {
        setOfflineFlag(false);
      }
      try {
        const data = await api.getTables();
        const actives = (data?.tables || []).filter((t) => t.active);
        if (actives.length > 0) {
          const random = actives[Math.floor(Math.random() * actives.length)];
          const origin = getBaseOrigin();
          const url = `${origin}/table/${random.id}`;
          setLiveUrl(url);
          return url;
        }
      } catch (error) {
        console.warn('Failed to fetch tables for landing live link', error);
      } finally {
        setLiveLoading(false);
      }
      return null;
    },
    []
  );

  useEffect(() => {
    let mounted = true;
    fetchLiveUrl().finally(() => {
      if (!mounted) return;
    });
    return () => {
      mounted = false;
    };
  }, [fetchLiveUrl]);

  const scrollToDemoQr = () => {
    setForceDemoVisible(true);

    const performScroll = (attempt = 0, lastRect?: { height: number; top: number }) => {
      if (typeof window === 'undefined') return;
      const wrapper = demoRef.current;
      if (!wrapper) return;

      const targetNode = wrapper.querySelector('[data-section="demo-qr"]') as HTMLElement | null;
      const liveQrAnchor = wrapper.querySelector('[data-live-qr-anchor]') as HTMLElement | null;
      const anchor =
        (liveQrAnchor?.querySelector('svg') as Element | null) ||
        liveQrAnchor ||
        (targetNode?.querySelector('img') as Element | null) ||
        (targetNode?.querySelector('svg') as Element | null) ||
        targetNode ||
        wrapper;

      const rect = anchor.getBoundingClientRect();
      const nav = document.querySelector('nav');
      const navHeight = nav instanceof HTMLElement ? nav.getBoundingClientRect().height : 0;
      const target = Math.max(0, rect.top + window.scrollY - navHeight - 24);

      window.scrollTo({ top: target, behavior: 'smooth' });
      // retry while layout is changing (lazy images loading)
      const heightChanged = !lastRect || Math.abs(rect.height - lastRect.height) > 8;
      const topChanged = !lastRect || Math.abs(rect.top - lastRect.top) > 8;
      if (attempt < 8 && (heightChanged || topChanged)) {
        setTimeout(() => performScroll(attempt + 1, { height: rect.height, top: rect.top }), 140);
      }
    };

    requestAnimationFrame(() => performScroll(0));
  };

  const openLiveStore = async () => {
    const url = await fetchLiveUrl({ forceOnline: true });
    const target = url || liveUrl;
    if (target) {
      // Navigate in the same tab to avoid popup blockers.
      window.location.assign(target);
    }
  };

  const startOfflineDemo = async () => {
    setOfflineFlag(true);
    try {
      const data = await api.getTables();
      const first = data?.tables?.[0];
      if (first?.id) {
        navigate(`/table/${first.id}`);
        return;
      }
    } catch (error) {
      console.warn('Failed to get tables for offline demo', error);
    }
    navigate('/table/T1');
  };

  // Do not connect to realtime streams from landing; ensure any active connection is closed.
  useEffect(() => {
    try {
      localStorage.setItem('CLIENT_PREFIX', 'landingpage');
    } catch (error) {
      console.warn('Failed to persist CLIENT_PREFIX', error);
    }
    if (typeof window !== 'undefined') {
      window.__OF_LANDING__ = true;
    }
    return () => {
      if (typeof window !== 'undefined' && window.__OF_LANDING__) {
        delete window.__OF_LANDING__;
      }
    };
  }, []);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      <Hero
        onScanQr={scrollToDemoQr}
        onOpenLive={openLiveStore}
        onOfflineDemo={startOfflineDemo}
        liveReady={!!liveUrl && !liveLoading}
      />
      <DeferredSection placeholderHeight={720}>
        <AnimatedMockup />
      </DeferredSection>
      <DeferredSection placeholderHeight={640}>
        <Features />
      </DeferredSection>
      <DeferredSection placeholderHeight={600}>
        <Testimonials />
      </DeferredSection>
      <div id="demo-qr" ref={demoRef} className="scroll-mt-24">
        <DeferredSection forceVisible={forceDemoVisible} placeholderHeight={1200}>
          <DemoQRGrid liveUrl={liveUrl ?? undefined} />
        </DeferredSection>
      </div>
      <footer className="relative bg-foreground text-background py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-accent opacity-20" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full mix-blend-overlay filter blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-secondary/20 rounded-full mix-blend-overlay filter blur-3xl" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div>
              <h3 className="text-3xl font-black mb-4 bg-gradient-primary bg-clip-text text-transparent">Garsone</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">Modern QR ordering system with real-time notifications and multi-language support.</p>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-background">Product</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-background transition-colors">Features</a></li>
                <li><a href="#demo-qr" className="hover:text-background transition-colors">Demo</a></li>
                <li><a href="/login" className="hover:text-background transition-colors">Login</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-background">Technology</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>React + TypeScript</li>
                <li>MQTT WebSocket</li>
                <li>PostgreSQL</li>
                <li>PWA Ready</li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-background">Contact</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>info@garsone.app</li>
                <li>+30 123 456 7890</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border pt-8 text-center">
            <p className="text-muted-foreground mb-2">© 2025 Garsone. All rights reserved.</p>
            <p className="text-sm text-muted-foreground">Built with React + TypeScript + Tailwind CSS + MQTT</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default AppLayout;

