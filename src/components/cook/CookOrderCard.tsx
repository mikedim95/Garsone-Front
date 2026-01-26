import { useMemo, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import type { Order, CartItem, OrderItemStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CookOrderItem } from "./CookOrderItem";
import { formatTableLabel } from "@/lib/formatTableLabel";
import {
  CheckCircle2,
  ChefHat,
  Timer,
  XCircle,
  Printer,
  ListChecks,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";

interface CookOrderCardProps {
  order: Order;
  queuePosition?: number;
  highlighted?: boolean;
  onAcceptAll: (id: string) => void;
  onAcceptWithPrint: (order: Order) => void;
  onCancel: (id: string) => void;
  onMarkAllReady: (id: string) => void;
  onViewModifiers: (order: Order) => void;
  onUpdateItemStatus: (
    orderId: string,
    orderItemId: string,
    status: OrderItemStatus
  ) => Promise<void>;
  isAccepting: boolean;
  isPrinting: boolean;
  isActing: boolean;
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

const formatTime = (dateStr: string) =>
  new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

export const CookOrderCard = ({
  order,
  queuePosition,
  highlighted = false,
  onAcceptAll,
  onAcceptWithPrint,
  onCancel,
  onMarkAllReady,
  onViewModifiers,
  onUpdateItemStatus,
  isAccepting,
  isPrinting,
  isActing,
}: CookOrderCardProps) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);

  const orderStatus = order.status as "PLACED" | "PREPARING";
  const elapsed = getElapsedMinutes(order.createdAt);
  const urgency = getUrgencyLevel(elapsed);

  // Filter out served items; keep accepted/pending visible.
  const visibleItems = useMemo(() => {
    const items = order.items ?? [];
    return items.filter((item) => item.status !== "SERVED");
  }, [order.items]);

  // Progress calculation
  const totalItems = order.items?.length ?? 0;
  const servedItems = (order.items ?? []).filter(
    (item) => item.status === "SERVED"
  ).length;
  const acceptedItems = (order.items ?? []).filter(
    (item) => item.status === "ACCEPTED"
  ).length;
  const progressPercent = totalItems > 0 ? (servedItems / totalItems) * 100 : 0;

  // Check if all visible items can have bulk action
  const hasPendingItems = visibleItems.some(
    (item) => item.status !== "ACCEPTED" && item.status !== "SERVED"
  );
  const hasCookingItems = visibleItems.some(
    (item) => item.status === "ACCEPTED"
  );

  if (visibleItems.length === 0) return null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -20 }}
      transition={{ duration: 0.3 }}
      className={clsx(
        "bg-card border rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-xl",
        highlighted && "ring-2 ring-amber-400/70 shadow-[0_0_24px_rgba(245,158,11,0.35)] animate-pulse",
        urgency === "critical" && "border-destructive/50 ring-1 ring-destructive/20",
        urgency === "warning" && "border-amber-500/50 ring-1 ring-amber-500/20",
        urgency === "normal" && "border-border hover:border-primary/30"
      )}
    >
      {/* Header */}
      <div
        className={clsx(
          "p-4 border-b border-border/50 cursor-pointer select-none",
          urgency === "critical" && "bg-destructive/5",
          urgency === "warning" && "bg-amber-500/5"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={clsx(
                "h-12 w-12 rounded-xl flex items-center justify-center font-bold text-lg shadow-lg",
                orderStatus === "PLACED"
                  ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground"
                  : "bg-gradient-to-br from-amber-500 to-amber-600 text-white"
              )}
            >
              {order.tableLabel}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">
                  {formatTableLabel(order.tableLabel)}
                </span>
                {queuePosition && (
                  <Badge variant="outline" className="text-[10px] px-1.5">
                    #{queuePosition}
                  </Badge>
                )}
                {urgency !== "normal" && (
                  <AlertTriangle
                    className={clsx(
                      "h-4 w-4",
                      urgency === "critical" ? "text-destructive" : "text-amber-500"
                    )}
                  />
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <Timer className="h-3 w-3" />
                <span>{formatTime(order.createdAt)}</span>
                <span
                  className={clsx(
                    "font-medium",
                    urgency === "critical" && "text-destructive",
                    urgency === "warning" && "text-amber-600"
                  )}
                >
                  ({elapsed}m)
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Progress indicator */}
            <div className="hidden sm:flex flex-col items-end gap-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{servedItems}/{totalItems}</span>
                <span className="text-muted-foreground/60">ready</span>
              </div>
              <Progress value={progressPercent} className="h-1.5 w-20" />
            </div>

            <Badge
              className={clsx(
                "border-0",
                orderStatus === "PLACED"
                  ? "bg-primary/20 text-primary"
                  : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
              )}
            >
              {visibleItems.length} items
            </Badge>

            <button
              type="button"
              className="p-1 rounded-lg hover:bg-muted transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
            >
              {isExpanded ? (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile progress */}
        <div className="sm:hidden mt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Progress</span>
            <span>{servedItems}/{totalItems} ready</span>
          </div>
          <Progress value={progressPercent} className="h-1.5" />
        </div>
      </div>

      {/* Note */}
      {order.note && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20">
          <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <span>📝</span>
            <span>{order.note}</span>
          </p>
        </div>
      )}

      {/* Items List */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
              <AnimatePresence mode="popLayout">
                {visibleItems.map((item: CartItem) => (
                  <CookOrderItem
                    key={item.orderItemId || `${item.item?.id}-${item.quantity}`}
                    item={item}
                    orderId={order.id}
                    onUpdateItemStatus={onUpdateItemStatus}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Actions */}
      <div className="p-4 border-t border-border/50 bg-muted/30">
        <div className="flex flex-wrap gap-2">
          {orderStatus === "PLACED" && hasPendingItems && (
            <>
              <Button
                size="sm"
                className="flex-1 min-w-[100px]"
                onClick={() => onAcceptAll(order.id)}
                disabled={isAccepting}
              >
                {isAccepting ? (
                  <span className="h-4 w-4 border-2 border-current/40 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <ChefHat className="h-4 w-4 mr-1.5" />
                    {t("cook.accept_all", { defaultValue: "Accept All" })}
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onAcceptWithPrint(order)}
                disabled={isPrinting}
                title={t("cook.accept_print", { defaultValue: "Accept & Print" })}
              >
                {isPrinting ? (
                  <span className="h-4 w-4 border-2 border-current/40 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Printer className="h-4 w-4" />
                )}
              </Button>
            </>
          )}

          {orderStatus === "PREPARING" && hasCookingItems && (
            <Button
              size="sm"
              className="flex-1 min-w-[100px] bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => onMarkAllReady(order.id)}
              disabled={isActing}
            >
              {isActing ? (
                <span className="h-4 w-4 border-2 border-current/40 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  {t("cook.all_ready", { defaultValue: "All Ready" })}
                </>
              )}
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={() => onViewModifiers(order)}
            title={t("cook.view_modifiers", { defaultValue: "View Details" })}
          >
            <ListChecks className="h-4 w-4" />
          </Button>

          {orderStatus === "PLACED" && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => onCancel(order.id)}
              disabled={isActing}
            >
              {isActing ? (
                <span className="h-4 w-4 border-2 border-current/40 border-t-transparent rounded-full animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
};
