import { useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import type { CartItem, OrderItemStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  ChefHat,
  Clock,
  Loader2,
} from "lucide-react";

interface CookOrderItemProps {
  item: CartItem;
  orderId: string;
  onUpdateItemStatus: (
    orderId: string,
    orderItemId: string,
    status: OrderItemStatus
  ) => Promise<void>;
}

const getItemStatusInfo = (
  status: OrderItemStatus | undefined
): { label: string; color: string; icon: React.ReactNode } => {
  if (status === "SERVED") {
    return {
      label: "Ready",
      color: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
      icon: <CheckCircle2 className="h-3 w-3" />,
    };
  }
  if (status === "ACCEPTED") {
    return {
      label: "Cooking",
      color: "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30",
      icon: <ChefHat className="h-3 w-3" />,
    };
  }
  return {
    label: "Pending",
    color: "bg-muted text-muted-foreground border-border",
    icon: <Clock className="h-3 w-3" />,
  };
};

export const CookOrderItem = ({
  item,
  orderId,
  onUpdateItemStatus,
}: CookOrderItemProps) => {
  const { t } = useTranslation();
  const [isUpdating, setIsUpdating] = useState(false);

  const orderItemId = item.orderItemId;
  const itemStatus = item.status;
  const statusInfo = getItemStatusInfo(itemStatus);

  const isServed = itemStatus === "SERVED";
  const isAccepted = itemStatus === "ACCEPTED";
  const isPending = !isServed && !isAccepted;
  const isCooking = isAccepted && !isServed;

  const canAccept = isPending && orderItemId;
  const canMarkReady = isCooking && !isServed && orderItemId;

  const handleAccept = async () => {
    if (!orderItemId || isUpdating) return;
    setIsUpdating(true);
    try {
      await onUpdateItemStatus(orderId, orderItemId, "ACCEPTED");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleMarkReady = async () => {
    if (!orderItemId || isUpdating) return;
    setIsUpdating(true);
    try {
      await onUpdateItemStatus(orderId, orderItemId, "SERVED");
    } finally {
      setIsUpdating(false);
    }
  };

  const modifierText = Object.entries(item.selectedModifiers || {})
    .map(([modifierId, optionId]) => item.selectedModifierLabels?.[modifierId] || optionId)
    .join(", ");

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      transition={{ duration: 0.2 }}
      className={clsx(
        "group relative flex items-center gap-3 p-3 rounded-xl border transition-all duration-200",
        isServed
          ? "bg-emerald-500/5 border-emerald-500/20 opacity-60"
          : isCooking
            ? "bg-amber-500/5 border-amber-500/20"
            : "bg-card border-border hover:border-primary/30 hover:shadow-sm"
      )}
    >
      {/* Quantity Badge */}
      <div
        className={clsx(
          "flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center font-bold text-sm shadow-sm transition-colors",
          isServed
            ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
            : isCooking
              ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
              : "bg-primary/10 text-primary"
        )}
      >
        {item.quantity}×
      </div>

      {/* Item Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "font-medium truncate",
              isServed ? "line-through text-muted-foreground" : "text-foreground"
            )}
          >
            {item.item?.name || "Item"}
          </span>
          <Badge
            variant="outline"
            className={clsx("text-[10px] px-1.5 py-0 gap-1 flex-shrink-0", statusInfo.color)}
          >
            {statusInfo.icon}
            {statusInfo.label}
          </Badge>
        </div>
        {modifierText && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {modifierText}
          </p>
        )}
      </div>

      {/* Actions */}
      <AnimatePresence mode="wait">
        {isUpdating ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex-shrink-0"
          >
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </motion.div>
        ) : canAccept ? (
          <motion.div
            key="accept"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <Button
              size="sm"
              variant="default"
              className="h-8 px-3 text-xs font-medium shadow-sm"
              onClick={handleAccept}
            >
              <ChefHat className="h-3.5 w-3.5 mr-1" />
              {t("cook.accept_item", { defaultValue: "Cook" })}
            </Button>
          </motion.div>
        ) : canMarkReady ? (
          <motion.div
            key="ready"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <Button
              size="sm"
              className="h-8 px-3 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              onClick={handleMarkReady}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              {t("cook.item_ready", { defaultValue: "Ready" })}
            </Button>
          </motion.div>
        ) : isServed ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
};
