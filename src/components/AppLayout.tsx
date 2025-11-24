import React, { useEffect, useState, useRef, lazy, Suspense, useCallback } from 'react';
import { Hero } from './landing/Hero';
import { Navigation } from './landing/Navigation';
import { realtimeService } from '@/lib/realtime';
import { api } from '@/lib/api';
import { useNavigate } from 'react-router-dom';

const AnimatedMockupLazy = lazy(() =>
  import('./landing/AnimatedMockup').then((mod) => ({ default: mod.AnimatedMockup }))
);
const FeaturesLazy = lazy(() =>
  import('./landing/Features').then((mod) => ({ default: mod.Features }))
);
const TestimonialsLazy = lazy(() =>
  import('./landing/Testimonials').then((mod) => ({ default: mod.Testimonials }))
);
const DemoQRGridLazy = lazy(() =>
  import('./landing/DemoQRGrid').then((mod) => ({ default: mod.DemoQRGrid }))
);

const DeferredSection: React.FC<{
  children: React.ReactNode;
  rootMargin?: string;
  forceVisible?: boolean;
  onVisible?: () => void;
}> = ({ children, rootMargin = '200px', forceVisible = false, onVisible }) => {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (forceVisible && !visible) {
      setVisible(true);
      return;
    }
    if (visible) return;
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setVisible(true);
      return;
    }

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, rootMargin, forceVisible]);

  useEffect(() => {
    if (visible && onVisible) {
      onVisible();
    }
  }, [visible, onVisible]);

  return <div ref={ref}>{visible ? children : null}</div>;
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
    requestAnimationFrame(() => {
      demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleDemoVisible = () => {
    demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openLiveStore = async () => {
    const url = await fetchLiveUrl({ forceOnline: true });
    const target = url || liveUrl;
    if (target) {
      window.open(target, '_blank', 'noopener');
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
    try {
      realtimeService.disconnect();
    } catch (error) {
      console.warn('Failed to disconnect realtime service', error);
    }
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent<{ connected: boolean }>('realtime-status', { detail: { connected: false } }));
      } catch (error) {
        console.warn('Failed to dispatch realtime status', error);
      }
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
      <DeferredSection>
        <Suspense fallback={<div className="py-16" />}>
          <AnimatedMockupLazy />
        </Suspense>
      </DeferredSection>
      <DeferredSection>
        <Suspense fallback={<div className="py-24" />}>
          <FeaturesLazy />
        </Suspense>
      </DeferredSection>
      <DeferredSection>
        <Suspense fallback={<div className="py-20" />}>
          <TestimonialsLazy />
        </Suspense>
      </DeferredSection>
      <div id="demo-qr" ref={demoRef} className="scroll-mt-24">
        <DeferredSection forceVisible={forceDemoVisible} onVisible={handleDemoVisible}>
          <Suspense fallback={<div className="py-24" />}>
            <DemoQRGridLazy liveUrl={liveUrl ?? undefined} />
          </Suspense>
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

