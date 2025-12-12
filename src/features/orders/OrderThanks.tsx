import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { HomeLink } from '@/components/HomeLink';
import { AppBurger } from '@/components/AppBurger';
import { CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { setStoredStoreSlug } from '@/lib/storeSlug';

type OrderReadyPayload = {
  orderId?: string;
  tableId?: string;
};

export default function OrderThanks() {
  const { orderId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const tableId = useMemo(() => {
    const qs = new URLSearchParams(location.search);
    return qs.get('tableId') || undefined;
  }, [location.search]);
  const [storeSlug, setStoreSlug] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const store = await api.getStore();
        if (mounted && store?.store?.slug) {
          setStoreSlug(store.store.slug);
        }
        if (store?.store?.name) {
          try {
            localStorage.setItem('STORE_NAME', store.store.name);
          } catch (error) {
            console.warn('Failed to persist STORE_NAME', error);
          }
        }
        if (store?.store?.slug) {
          try {
            setStoredStoreSlug(store.store.slug);
            window.dispatchEvent(new CustomEvent('store-slug-changed', { detail: { slug: store.store.slug } }));
          } catch (error) {
            console.warn('Failed to persist STORE_SLUG', error);
          }
        }
      } catch (error) {
        console.error('Failed to load store info', error);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    return () => {};
  }, [storeSlug, orderId, tableId]);

  return (
    <div className="min-h-screen bg-gradient-primary flex items-center justify-center p-4">
      <div className="absolute top-4 left-4">
        <HomeLink />
      </div>
      <div className="absolute top-4 right-4">
        <AppBurger />
      </div>
      <div className="bg-card rounded-2xl p-8 max-w-md w-full text-center border border-border">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="h-12 w-12 text-primary" />
        </div>
        <h1 className="text-3xl font-bold mb-4">Order Placed!</h1>
        <p className="text-muted-foreground mb-2">Your order has been sent to the kitchen.</p>
        <p className="text-sm text-muted-foreground mb-8">Order ID: {orderId}</p>
        {ready ? (
          <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 mb-8">
            <p className="text-sm text-primary">Your order is ready! Please proceed to the counter.</p>
          </div>
        ) : (
          <div className="bg-accent/20 border border-accent/40 rounded-lg p-4 mb-8">
            <p className="text-sm text-accent-foreground">You'll receive a notification when your order is ready.</p>
          </div>
        )}
        <Button
          onClick={() => {
            // Go directly to the menu for this table (or home if unknown) instead of history.back()
            if (tableId) {
              navigate(`/${tableId}`);
            } else {
              navigate("/");
            }
          }}
          className="w-full"
        >
          Back to Menu
        </Button>
      </div>
    </div>
  );
}
