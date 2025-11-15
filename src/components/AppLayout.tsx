import React, { useEffect } from 'react';
import { Hero } from './landing/Hero';
import { Features } from './landing/Features';
import { AnimatedMockup } from './landing/AnimatedMockup';
import { DemoQRGrid } from './landing/DemoQRGrid';
import { Navigation } from './landing/Navigation';
import { Testimonials } from './landing/Testimonials';
import { realtimeService } from '@/lib/realtime';

const AppLayout: React.FC = () => {
  // Do not connect to realtime streams from landing; ensure any active connection is closed.
  useEffect(() => {
    try { localStorage.setItem('CLIENT_PREFIX', 'landingpage'); } catch {}
    if (typeof window !== 'undefined') {
      (window as any).__OF_LANDING__ = true;
    }
    try { realtimeService.disconnect(); } catch {}
    if (typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent('realtime-status', { detail: { connected: false } })); } catch {}
    }
    return () => {
      if (typeof window !== 'undefined' && (window as any).__OF_LANDING__) {
        delete (window as any).__OF_LANDING__;
      }
    };
  }, []);
  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <Hero />
      <AnimatedMockup />
      <Features />
      <Testimonials />
      <DemoQRGrid />
      <footer className="relative bg-gray-900 text-white py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full mix-blend-overlay filter blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full mix-blend-overlay filter blur-3xl" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div>
              <h3 className="text-3xl font-black mb-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">OrderFlow</h3>
              <p className="text-gray-400 text-sm leading-relaxed">Modern QR ordering system with real-time notifications and multi-language support.</p>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-white">Product</h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#demo-qr" className="hover:text-white transition-colors">Demo</a></li>
                <li><a href="/login" className="hover:text-white transition-colors">Login</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-white">Technology</h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li>React + TypeScript</li>
                <li>MQTT WebSocket</li>
                <li>PostgreSQL</li>
                <li>PWA Ready</li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4 text-white">Contact</h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li>info@orderflow.app</li>
                <li>+30 123 456 7890</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center">
            <p className="text-gray-400 mb-2">© 2025 OrderFlow. All rights reserved.</p>
            <p className="text-sm text-gray-500">Built with React + TypeScript + Tailwind CSS + MQTT</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default AppLayout;

