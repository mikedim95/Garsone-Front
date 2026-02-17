import restaurant1 from '@/assets/logos/restaurant-1.png';
import restaurant2 from '@/assets/logos/restaurant-2.png';
import restaurant3 from '@/assets/logos/restaurant-3.png';
import restaurant4 from '@/assets/logos/restaurant-4.png';
import restaurant5 from '@/assets/logos/restaurant-5.png';
import restaurant6 from '@/assets/logos/restaurant-6.png';
import { useTranslation } from 'react-i18next';

const logos = [
  restaurant1,
  restaurant2,
  restaurant3,
  restaurant4,
  restaurant5,
  restaurant6,
];

export const Testimonials = () => {
  const { t } = useTranslation();

  return (
    <section className="relative py-20 overflow-hidden bg-gradient-card">
      <div className="absolute inset-0 bg-gradient-accent opacity-40" />
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 mb-12 text-center">
        <h2 className="text-3xl md:text-4xl font-black mb-4 text-foreground">
          {t('landing.testimonials.title', {
            defaultValue: 'Trusted by Leading Restaurants',
          })}
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          {t('landing.testimonials.subtitle', {
            defaultValue:
              'Join hundreds of restaurants already using Garsone to streamline their operations',
          })}
        </p>
      </div>

      <div className="relative">
        <div className="flex animate-scroll">
          {/* First set of logos */}
          {logos.map((logo, index) => (
            <div
              key={`logo-1-${index}`}
              className="flex-shrink-0 mx-8 w-48 h-24 flex items-center justify-center glass rounded-xl p-4 hover:scale-105 transition-transform duration-300"
            >
              <img
                src={logo}
                alt={`Restaurant ${index + 1}`}
                loading="lazy"
                className="max-w-full max-h-full object-contain opacity-70 hover:opacity-100 transition-opacity"
              />
            </div>
          ))}
          {/* Duplicate set for seamless loop */}
          {logos.map((logo, index) => (
            <div
              key={`logo-2-${index}`}
              className="flex-shrink-0 mx-8 w-48 h-24 flex items-center justify-center glass rounded-xl p-4 hover:scale-105 transition-transform duration-300"
            >
              <img
                src={logo}
                alt={`Restaurant ${index + 1}`}
                loading="lazy"
                className="max-w-full max-h-full object-contain opacity-70 hover:opacity-100 transition-opacity"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
