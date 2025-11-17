import React, { useEffect } from 'react';
import { Hero } from './landing/Hero';
import { Features } from './landing/Features';
import { AnimatedMockup } from './landing/AnimatedMockup';
import { DemoQRGrid } from './landing/DemoQRGrid';
import { Navigation } from './landing/Navigation';
import { Testimonials } from './landing/Testimonials';
import { realtimeService } from '@/lib/realtime';

declare global {
  interface Window {
    __OF_LANDING__?: boolean;
  }
}

const AppLayout: React.FC = () => {
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
      <Hero />
      <AnimatedMockup />
      <Features />
      <Testimonials />
      <DemoQRGrid />
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

