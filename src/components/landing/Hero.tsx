import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { QrCode, LogIn, Play, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { HERO_IMAGE } from '@/lib/mockData';

export const Hero = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-white via-purple-50/30 to-blue-50/30">
      {/* Animated gradient orbs */}
      <div className="absolute top-0 -left-4 w-96 h-96 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float" />
      <div className="absolute top-0 -right-4 w-96 h-96 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float" style={{ animationDelay: '2s' }} />
      <div className="absolute -bottom-8 left-20 w-96 h-96 bg-pink-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float" style={{ animationDelay: '4s' }} />
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 text-center pt-24 sm:pt-40 pb-16 sm:pb-32">
        <div className="inline-flex items-center gap-2 glass px-5 py-2.5 rounded-full mb-12 shadow-lg hover:shadow-xl transition-shadow">
          <Sparkles className="h-4 w-4 text-purple-600" />
          <span className="text-gray-700 text-sm font-medium">{t('hero.ribbon')}</span>
        </div>
        
        <h1 className="text-4xl sm:text-6xl md:text-8xl font-black mb-6 sm:mb-8 animate-fade-in leading-tight tracking-tight text-balance max-w-4xl mx-auto break-words">
          <span className="bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 bg-clip-text text-transparent animate-gradient">
            {t('hero.title')}
          </span>
        </h1>
        
        <p className="text-xl md:text-2xl text-gray-600 mb-16 max-w-3xl mx-auto leading-relaxed text-balance font-light">
          {t('hero.subtitle')}
        </p>
        
        <div className="flex flex-wrap gap-4 justify-center mb-24">
          <Button 
            size="lg" 
            onClick={() => {
              document.getElementById('demo-qr')?.scrollIntoView({ behavior: 'smooth' });
            }} 
            className="gap-2 text-base px-10 py-7 rounded-2xl shadow-lg hover:shadow-2xl hover:scale-105 transition-all duration-300 bg-gradient-to-r from-purple-600 to-blue-600"
          >
            <Play className="h-5 w-5" />
            {t('hero.cta_demo')}
          </Button>
          <Button 
            size="lg" 
            variant="outline" 
            onClick={() => {
              document.getElementById('demo-qr')?.scrollIntoView({ behavior: 'smooth' });
            }} 
            className="gap-2 text-base px-10 py-7 rounded-2xl border-2 hover:border-purple-600 hover:bg-purple-50 transition-all duration-300 hover:scale-105"
          >
            <QrCode className="h-5 w-5" />
            {t('hero.cta_scan')}
          </Button>
          <Button 
            size="lg" 
            variant="outline" 
            onClick={() => navigate('/login')} 
            className="gap-2 text-base px-10 py-7 rounded-2xl border-2 hover:border-purple-600 hover:bg-purple-50 transition-all duration-300 hover:scale-105"
          >
            <LogIn className="h-5 w-5" />
            {t('hero.cta_login')}
          </Button>
        </div>

        <div className="relative max-w-6xl mx-auto">
          <div className="absolute -inset-8 bg-gradient-to-r from-purple-400 via-blue-400 to-purple-400 rounded-3xl blur-3xl opacity-30 animate-glow" />
          <img 
            src={HERO_IMAGE} 
            alt="OrderFlow" 
            className="relative rounded-3xl shadow-2xl ring-1 ring-gray-200 hover:scale-[1.02] transition-transform duration-500" 
          />
        </div>
      </div>
    </div>
  );
};


