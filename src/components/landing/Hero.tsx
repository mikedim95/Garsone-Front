import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { QrCode, LogIn, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { HERO_IMAGE } from '@/lib/mockData';

type HeroProps = {
  onScanQr?: () => void;
  onDemo?: () => void;
};

export const Hero = ({ onScanQr, onDemo }: HeroProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleScrollToDemo = () => {
    if (onDemo) {
      onDemo();
      return;
    }
    if (onScanQr) {
      onScanQr();
      return;
    }
    document.getElementById('demo-qr')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-card">
      {/* Animated gradient orbs */}
      <div className="absolute top-0 -left-4 w-96 h-96 bg-primary/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float" />
      <div className="absolute top-0 -right-4 w-96 h-96 bg-secondary/30 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float" style={{ animationDelay: '2s' }} />
      <div className="absolute -bottom-8 left-20 w-96 h-96 bg-accent/30 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float" style={{ animationDelay: '4s' }} />
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 text-center pt-24 sm:pt-40 pb-16 sm:pb-32">
        <h1 className="text-4xl sm:text-6xl md:text-8xl font-black mb-6 sm:mb-8 animate-fade-in leading-tight tracking-tight text-balance max-w-4xl mx-auto break-words">
          <span className="bg-gradient-primary bg-clip-text text-transparent animate-gradient">
            {t('hero.title')}
          </span>
        </h1>
        
        <p className="text-xl md:text-2xl text-muted-foreground mb-16 max-w-3xl mx-auto leading-relaxed text-balance font-light">
          {t('hero.subtitle')}
        </p>
        
        <div className="flex flex-wrap gap-4 justify-center mb-24">
          <Button 
            size="lg" 
            variant="outline" 
            onClick={onScanQr ?? handleScrollToDemo} 
            className="gap-2 text-base px-10 py-7 rounded-2xl border-2 border-border hover:border-primary hover:bg-accent/30 transition-all duration-300 hover:scale-105 text-foreground"
          >
            <QrCode className="h-5 w-5" />
            {t('hero.cta_scan')}
          </Button>
          <Button 
            size="lg" 
            variant="outline" 
            onClick={() => navigate('/login')} 
            className="gap-2 text-base px-10 py-7 rounded-2xl border-2 border-border hover:border-primary hover:bg-accent/30 transition-all duration-300 hover:scale-105 text-foreground"
          >
            <LogIn className="h-5 w-5" />
            {t('hero.cta_login')}
          </Button>
        </div>

        <div className="relative max-w-6xl mx-auto">
          <div className="absolute -inset-8 bg-gradient-primary rounded-3xl blur-3xl opacity-30 animate-glow" />
          <img 
            src={HERO_IMAGE} 
            alt="Garsone" 
            className="relative rounded-3xl shadow-2xl ring-1 ring-gray-200 hover:scale-[1.02] transition-transform duration-500" 
          />
        </div>
      </div>
    </div>
  );
};


