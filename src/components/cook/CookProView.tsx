import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import type { Order, OrderItemStatus } from "@/types";
import { Badge } from "@/components/ui/badge";
import { CookOrderCard } from "./CookOrderCard";
import {
  Clock,
  ChefHat,
  AlertTriangle,
  Utensils,
} from "lucide-react";

interface CookProViewProps {
  incoming: Order[];
  preparing: Order[];
  loadingOrders: boolean;
  accepting: Set<string>;
  printing: Set<string>;
  actingIds: Set<string>;
  selectedItemsByOrder: Record<string, Record<string, boolean>>;
  onAccept: (id: string) => void;
  onAcceptWithPrint: (order: Order) => void;
  onCancel: (id: string) => void;
  onMarkReady: (id: string) => void;
  onViewModifiers: (order: Order) => void;
  onToggleItem: (
    orderId: string,
    orderItemId: string,
    selected: boolean
  ) => void;
  onUpdateItemStatus?: (
    orderId: string,
    orderItemId: string,
    status: OrderItemStatus
  ) => Promise<void>;
}

const getElapsedMinutes = (createdAt: string) => {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  return Math.floor((now - created) / 60000);
};

const getUrgencyLevel = (minutes: number): "normal" | "warning" | "critical" => {
  if (minutes >= 15) return "critical";
  if (minutes >= 10) return "warning";
  return "normal";
};

export const CookProView = ({
  incoming,
  preparing,
  loadingOrders,
  accepting,
  printing,
  actingIds,
  selectedItemsByOrder,
  onAccept,
  onAcceptWithPrint,
  onCancel,
  onMarkReady,
  onViewModifiers,
  onToggleItem,
  onUpdateItemStatus,
}: CookProViewProps) => {
  const { t } = useTranslation();
  const [highlightedOrderId, setHighlightedOrderId] = useState<string | null>(null);
  const orderRefs = useRef(new Map<string, HTMLDivElement | null>());
  const highlightTimer = useRef<number | null>(null);

  const stats = useMemo(() => {
    const totalItems = [...incoming, ...preparing].reduce((sum, o) => {
      const items = o.items ?? [];
      if (o.status === "PLACED") {
        return (
          sum +
          items.filter(
            (item) => item.status !== "ACCEPTED" && item.status !== "SERVED"
          ).length
        );
      }
      if (o.status === "PREPARING") {
        return sum + items.filter((item) => item.status !== "SERVED").length;
      }
      return sum + items.length;
    }, 0);
    const avgWaitTime =
      incoming.length > 0
        ? Math.round(
            incoming.reduce((sum, o) => sum + getElapsedMinutes(o.createdAt), 0) /
              incoming.length
          )
        : 0;
    const urgentOrders = [...incoming, ...preparing].filter(
      (o) => getUrgencyLevel(getElapsedMinutes(o.createdAt)) !== "normal"
    ).length;
    return { totalItems, avgWaitTime, urgentOrders };
  }, [incoming, preparing]);

  const urgentTarget = useMemo(() => {
    const all = [...incoming, ...preparing];
    const urgent = all
      .map((order) => ({
        order,
        urgency: getUrgencyLevel(getElapsedMinutes(order.createdAt)),
      }))
      .filter(({ urgency }) => urgency !== "normal");
    if (urgent.length === 0) return null;
    const weight = (level: "normal" | "warning" | "critical") =>
      level === "critical" ? 2 : level === "warning" ? 1 : 0;
    urgent.sort((a, b) => {
      const diff = weight(b.urgency) - weight(a.urgency);
      if (diff !== 0) return diff;
      return new Date(a.order.createdAt).getTime() - new Date(b.order.createdAt).getTime();
    });
    return urgent[0].order;
  }, [incoming, preparing]);

  useEffect(() => {
    return () => {
      if (highlightTimer.current) {
        window.clearTimeout(highlightTimer.current);
        highlightTimer.current = null;
      }
    };
  }, []);

  const handleUpdateItemStatus = async (
    orderId: string,
    orderItemId: string,
    status: OrderItemStatus
  ) => {
    if (onUpdateItemStatus) {
      await onUpdateItemStatus(orderId, orderItemId, status);
    }
  };

  const handleUrgentClick = () => {
    if (!urgentTarget) return;
    const node = orderRefs.current.get(urgentTarget.id);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setHighlightedOrderId(urgentTarget.id);
    if (highlightTimer.current) {
      window.clearTimeout(highlightTimer.current);
    }
    highlightTimer.current = window.setTimeout(() => {
      setHighlightedOrderId(null);
    }, 2200);
  };

  if (loadingOrders) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          className="bg-card border border-border rounded-xl p-4 flex items-center gap-3"
        >
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{incoming.length}</p>
            <p className="text-xs text-muted-foreground">{t("cook.pending", { defaultValue: "Pending" })}</p>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-card border border-border rounded-xl p-4 flex items-center gap-3"
        >
          <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <ChefHat className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{preparing.length}</p>
            <p className="text-xs text-muted-foreground">{t("cook.preparing", { defaultValue: "Preparing" })}</p>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-border rounded-xl p-4 flex items-center gap-3"
        >
          <div className="h-10 w-10 rounded-lg bg-accent/20 flex items-center justify-center">
            <Utensils className="h-5 w-5 text-accent-foreground" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{stats.totalItems}</p>
            <p className="text-xs text-muted-foreground">{t("cook.total_items", { defaultValue: "Items" })}</p>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className={clsx(
            "bg-card border border-border rounded-xl p-4 flex items-center gap-3",
            urgentTarget ? "cursor-pointer hover:border-destructive/60" : "opacity-70"
          )}
          onClick={handleUrgentClick}
          onKeyDown={(event) => {
            if (!urgentTarget) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleUrgentClick();
            }
          }}
          role="button"
          aria-disabled={!urgentTarget}
          tabIndex={urgentTarget ? 0 : -1}
        >
          <div className={clsx(
            "h-10 w-10 rounded-lg flex items-center justify-center",
            stats.urgentOrders > 0 ? "bg-destructive/20" : "bg-muted"
          )}>
            <AlertTriangle className={clsx("h-5 w-5", stats.urgentOrders > 0 ? "text-destructive" : "text-muted-foreground")} />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{stats.urgentOrders}</p>
            <p className="text-xs text-muted-foreground">{t("cook.urgent", { defaultValue: "Urgent" })}</p>
          </div>
        </motion.div>
      </div>

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Incoming Orders Column */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 pb-2 border-b border-border">
            <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
            <h2 className="text-lg font-semibold text-foreground">
              {t("cook.incoming_orders")}
            </h2>
            <Badge variant="secondary" className="ml-auto">
              {incoming.length}
            </Badge>
          </div>

          <div className="space-y-4 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
            {incoming.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>{t("cook.no_incoming", { defaultValue: "No pending orders" })}</p>
              </div>
            ) : (
              incoming.map((order, idx) => (
                <div
                  key={order.id}
                  ref={(node) => {
                    if (node) {
                      orderRefs.current.set(order.id, node);
                    } else {
                      orderRefs.current.delete(order.id);
                    }
                  }}
                >
                  <CookOrderCard
                    order={order}
                    queuePosition={idx + 1}
                    highlighted={highlightedOrderId === order.id}
                    onAcceptAll={onAccept}
                    onAcceptWithPrint={onAcceptWithPrint}
                    onCancel={onCancel}
                    onMarkAllReady={onMarkReady}
                    onViewModifiers={onViewModifiers}
                    onUpdateItemStatus={handleUpdateItemStatus}
                    selectedItems={selectedItemsByOrder[order.id] ?? {}}
                    onToggleItem={onToggleItem}
                    isAccepting={accepting.has(order.id)}
                    isPrinting={printing.has(order.id)}
                    isActing={actingIds.has(`cancel:${order.id}`)}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Preparing Orders Column */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 pb-2 border-b border-border">
            <div className="h-3 w-3 rounded-full bg-amber-500 animate-pulse" />
            <h2 className="text-lg font-semibold text-foreground">
              {t("cook.in_preparation")}
            </h2>
            <Badge variant="secondary" className="ml-auto">
              {preparing.length}
            </Badge>
          </div>

          <div className="space-y-4 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
            {preparing.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ChefHat className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>{t("cook.no_preparing", { defaultValue: "Nothing cooking" })}</p>
              </div>
            ) : (
              preparing.map((order) => (
                <div
                  key={order.id}
                  ref={(node) => {
                    if (node) {
                      orderRefs.current.set(order.id, node);
                    } else {
                      orderRefs.current.delete(order.id);
                    }
                  }}
                >
                  <CookOrderCard
                    order={order}
                    highlighted={highlightedOrderId === order.id}
                    onAcceptAll={onAccept}
                    onAcceptWithPrint={onAcceptWithPrint}
                    onCancel={onCancel}
                    onMarkAllReady={onMarkReady}
                    onViewModifiers={onViewModifiers}
                    onUpdateItemStatus={handleUpdateItemStatus}
                    selectedItems={selectedItemsByOrder[order.id] ?? {}}
                    onToggleItem={onToggleItem}
                    isAccepting={accepting.has(order.id)}
                    isPrinting={printing.has(order.id)}
                    isActing={actingIds.has(`ready:${order.id}`)}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
