import { QrCode, Zap, Bell, Globe, Shield, TrendingUp, Users, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const features = [
  {
    icon: QrCode,
    key: 'qr',
    titleDefault: 'QR Code Ordering',
    descDefault: 'Customers scan and order instantly. No app install needed.',
  },
  {
    icon: Zap,
    key: 'mqtt',
    titleDefault: 'Real-time MQTT',
    descDefault: 'Instant order updates via WebSocket. Lightning fast notifications.',
  },
  {
    icon: Bell,
    key: 'alerts',
    titleDefault: 'Smart Alerts',
    descDefault: 'Notify customers when orders are ready. Call waiter with one tap.',
  },
  {
    icon: Globe,
    key: 'language',
    titleDefault: 'Multi-language',
    descDefault: 'Full Greek and English support. Switch languages seamlessly.',
  },
  {
    icon: Shield,
    key: 'security',
    titleDefault: 'IP Whitelisting',
    descDefault: 'Secure orders from your venue only. No fake orders.',
  },
  {
    icon: TrendingUp,
    key: 'analytics',
    titleDefault: 'Analytics Dashboard',
    descDefault: 'Track orders, revenue, and performance in real-time.',
  },
  {
    icon: Users,
    key: 'roles',
    titleDefault: 'Role-based Access',
    descDefault: 'Separate dashboards for waiters and managers.',
  },
  {
    icon: Clock,
    key: 'orders',
    titleDefault: 'Order Management',
    descDefault: 'Track status from placed to served. Export to CSV.',
  },
];

export const Features = () => {
  const { t } = useTranslation();

  return (
    <div className="py-32 bg-gradient-card">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-20">
          <h2 className="text-6xl md:text-7xl font-black mb-6 text-foreground tracking-tight">
            {t('landing.features.title', { defaultValue: 'Everything You Need' })}
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-light">
            {t('landing.features.subtitle', {
              defaultValue:
                'A complete ordering system with modern tech stack and professional features',
            })}
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, idx) => (
            <div
              key={idx}
              className="group p-8 rounded-3xl bg-card text-card-foreground border border-border transition-all duration-300 hover:shadow-xl hover:-translate-y-2"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-primary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                <feature.icon className="h-7 w-7 text-primary-foreground" strokeWidth={2.5} />
              </div>
              <h3 className="text-xl font-bold mb-3 text-foreground">
                {t(`landing.features.cards.${feature.key}.title`, {
                  defaultValue: feature.titleDefault,
                })}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {t(`landing.features.cards.${feature.key}.desc`, {
                  defaultValue: feature.descDefault,
                })}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-24 relative overflow-hidden rounded-[2.5rem] p-16 text-center bg-gradient-primary animate-gradient">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjEiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-30" />
          <div className="relative z-10">
            <h3 className="text-4xl md:text-5xl font-black mb-6 text-primary-foreground">
              {t('landing.features.cta.title', { defaultValue: 'Ready to modernize?' })}
            </h3>
            <p className="text-xl text-primary-foreground/90 mb-12 max-w-2xl mx-auto font-light">
              {t('landing.features.cta.subtitle', {
                defaultValue:
                  'Join the future of dining with Garsone. Setup in minutes, delight customers instantly.',
              })}
            </p>
            <div className="flex gap-6 justify-center flex-wrap">
              <div className="glass-dark px-8 py-5 rounded-2xl shadow-xl">
                <div className="font-black text-4xl text-primary-foreground mb-1">5 min</div>
                <div className="text-primary-foreground/70 text-sm font-medium">
                  {t('landing.features.cta.setup_time', { defaultValue: 'Setup Time' })}
                </div>
              </div>
              <div className="glass-dark px-8 py-5 rounded-2xl shadow-xl">
                <div className="font-black text-4xl text-primary-foreground mb-1">0 EUR</div>
                <div className="text-primary-foreground/70 text-sm font-medium">
                  {t('landing.features.cta.monthly_fee', { defaultValue: 'Monthly Fee' })}
                </div>
              </div>
              <div className="glass-dark px-8 py-5 rounded-2xl shadow-xl">
                <div className="font-black text-4xl text-primary-foreground mb-1">inf</div>
                <div className="text-primary-foreground/70 text-sm font-medium">
                  {t('landing.features.cta.orders', { defaultValue: 'Orders' })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
