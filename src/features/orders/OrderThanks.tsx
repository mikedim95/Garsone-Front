import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { HomeLink } from '@/components/HomeLink';
import { AppBurger } from '@/components/AppBurger';
import { CheckCircle, Clock, Utensils } from 'lucide-react';
import { motion } from 'framer-motion';
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
  const { tableId, paid } = useMemo(() => {
    const qs = new URLSearchParams(location.search);
    return {
      tableId: qs.get('tableId') || undefined,
      paid: qs.get('paid') === '1',
    };
  }, [location.search]);
  const [storeSlug, setStoreSlug] = useState<string>('');

  // Placeholder values - will be populated from API later
  const queuePosition: number | null = null; // e.g., 3
  const estimatedMinutes: number | null = null; // e.g., 15

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
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30 flex items-center justify-center p-4">
      <div className="absolute top-4 left-4">
        <HomeLink />
      </div>
      <div className="absolute top-4 right-4">
        <AppBurger />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="max-w-sm w-full text-center"
      >
        {/* Success Icon */}
        <motion.div 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="relative mx-auto mb-8"
        >
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.4, type: "spring", stiffness: 300 }}
            >
              <CheckCircle className="h-12 w-12 text-primary" strokeWidth={1.5} />
            </motion.div>
          </div>
          {/* Subtle ring animation */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1.2, opacity: 0 }}
            transition={{ delay: 0.5, duration: 1, ease: "easeOut" }}
            className="absolute inset-0 w-24 h-24 mx-auto border-2 border-primary/30 rounded-full"
          />
        </motion.div>

        {/* Main Message */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            Thank you!
          </h1>
          <p className="text-muted-foreground text-sm mb-8">
            {paid 
              ? 'Payment confirmed — your order is being prepared.' 
              : 'Your order has been sent to the kitchen.'}
          </p>
        </motion.div>

        {/* Status Cards */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="space-y-3 mb-8"
        >
          {/* Queue Position / Priority */}
          <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Utensils className="w-5 h-5 text-primary" strokeWidth={1.5} />
            </div>
            <div className="text-left flex-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Queue Position</p>
              <p className="text-lg font-medium text-foreground">
                {queuePosition !== null ? `#${queuePosition}` : '—'}
              </p>
            </div>
          </div>

          {/* Estimated Time */}
          <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-primary" strokeWidth={1.5} />
            </div>
            <div className="text-left flex-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Estimated Time</p>
              <p className="text-lg font-medium text-foreground">
                {estimatedMinutes !== null ? `~${estimatedMinutes} min` : '—'}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Ready notification */}
        {ready && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-6"
          >
            <p className="text-sm text-primary font-medium">
              Your order is ready!
            </p>
          </motion.div>
        )}

        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <Button
            variant="ghost"
            onClick={() => {
              if (tableId) {
                navigate(`/${tableId}`);
              } else {
                navigate("/");
              }
            }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Menu
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
