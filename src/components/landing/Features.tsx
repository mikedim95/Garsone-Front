import { QrCode, Zap, Bell, Globe, Shield, TrendingUp, Users, Clock } from 'lucide-react';

const features = [
  { icon: QrCode, title: 'QR Code Ordering', desc: 'Customers scan & order instantly. No app install needed.' },
  { icon: Zap, title: 'Real-time MQTT', desc: 'Instant order updates via WebSocket. Lightning fast notifications.' },
  { icon: Bell, title: 'Smart Alerts', desc: 'Notify customers when orders are ready. Call waiter with one tap.' },
  { icon: Globe, title: 'Multi-language', desc: 'Full Greek & English support. Switch languages seamlessly.' },
  { icon: Shield, title: 'IP Whitelisting', desc: 'Secure orders from your venue only. No fake orders.' },
  { icon: TrendingUp, title: 'Analytics Dashboard', desc: 'Track orders, revenue, and performance in real-time.' },
  { icon: Users, title: 'Role-based Access', desc: 'Separate dashboards for waiters and managers.' },
  { icon: Clock, title: 'Order Management', desc: 'Track status from placed to served. Export to CSV.' },
];

export const Features = () => {
  return (
    <div className="py-32 bg-gradient-to-b from-white to-gray-50/50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-20">
          <h2 className="text-6xl md:text-7xl font-black mb-6 text-gray-900 tracking-tight">
            Everything You Need
          </h2>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto font-light">
            A complete ordering system with modern tech stack and professional features
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, idx) => (
            <div 
              key={idx} 
              className="group p-8 rounded-3xl bg-white border border-gray-100 hover:border-purple-200 transition-all duration-300 hover:shadow-xl hover:-translate-y-2"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                <feature.icon className="h-7 w-7 text-white" strokeWidth={2.5} />
              </div>
              <h3 className="text-xl font-bold mb-3 text-gray-900">{feature.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-24 relative overflow-hidden rounded-[2.5rem] p-16 text-center bg-gradient-to-br from-purple-600 via-blue-600 to-purple-600 animate-gradient">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjEiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-30" />
          <div className="relative z-10">
            <h3 className="text-4xl md:text-5xl font-black mb-6 text-white">Ready to modernize?</h3>
            <p className="text-xl text-white/90 mb-12 max-w-2xl mx-auto font-light">
              Join the future of dining with Garsone. Setup in minutes, delight customers instantly.
            </p>
            <div className="flex gap-6 justify-center flex-wrap">
              <div className="glass-dark px-8 py-5 rounded-2xl shadow-xl">
                <div className="font-black text-4xl text-white mb-1">5 min</div>
                <div className="text-white/70 text-sm font-medium">Setup Time</div>
              </div>
              <div className="glass-dark px-8 py-5 rounded-2xl shadow-xl">
                <div className="font-black text-4xl text-white mb-1">0€</div>
                <div className="text-white/70 text-sm font-medium">Monthly Fee</div>
              </div>
              <div className="glass-dark px-8 py-5 rounded-2xl shadow-xl">
                <div className="font-black text-4xl text-white mb-1">∞</div>
                <div className="text-white/70 text-sm font-medium">Orders</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
