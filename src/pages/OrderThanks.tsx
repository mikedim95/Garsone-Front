import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { HomeLink } from '@/components/HomeLink';
import { AppBurger } from './AppBurger';
import { CheckCircle } from 'lucide-react';
import { mqttService } from '@/lib/mqtt';
import { api } from '@/lib/api';

export default function OrderThanks() {
  const { orderId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const tableId = useMemo(() => {
    const qs = new URLSearchParams(location.search);
    return qs.get('tableId') || undefined;
  }, [location.search]);
  const [storeSlug, setStoreSlug] = useState<string>('demo-cafe');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const store = (await api.getStore()) as any;
        if (mounted && store?.store?.slug) {
          setStoreSlug(store.store.slug);
          try {
            localStorage.setItem('STORE_SLUG', store.store.slug);
            window.dispatchEvent(new CustomEvent('store-slug-changed', { detail: { slug: store.store.slug } }));
          } catch {}
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!storeSlug) return;
    const topics: string[] = [];
    mqttService.connect().then(() => {
      const t = `${storeSlug}/orders/ready`;
      topics.push(t);
      mqttService.subscribe(t, (msg: any) => {
        if (orderId && msg?.orderId === orderId) setReady(true);
        else if (!orderId && tableId && msg?.tableId === tableId) setReady(true);
      });
    });
    return () => { topics.forEach((t) => mqttService.unsubscribe(t)); };
  }, [storeSlug, orderId, tableId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center p-4">
      <div className="absolute top-4 left-4">
        <HomeLink />
      </div>
      <div className="absolute top-4 right-4">
        <AppBurger />
      </div>
      <div className="bg-card rounded-2xl p-8 max-w-md w-full text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="h-12 w-12 text-green-600" />
        </div>
        <h1 className="text-3xl font-bold mb-4">Order Placed!</h1>
        <p className="text-muted-foreground mb-2">Your order has been sent to the kitchen.</p>
        <p className="text-sm text-muted-foreground mb-8">Order ID: {orderId}</p>
        {ready ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-8">
            <p className="text-sm text-green-800">Your order is ready! Please proceed to the counter.</p>
          </div>
        ) : (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-8">
            <p className="text-sm text-purple-800">You'll receive a notification when your order is ready.</p>
          </div>
        )}
        <Button onClick={() => navigate(-1)} className="w-full">
          Back to Menu
        </Button>
      </div>
    </div>
  );
}


