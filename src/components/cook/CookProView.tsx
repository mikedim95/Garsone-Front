import { useMemo } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import type { Order, CartItem } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatTableLabel } from "@/lib/formatTableLabel";
import {
  Clock,
  ChefHat,
  CheckCircle2,
  XCircle,
  Printer,
  AlertTriangle,
  Timer,
  Utensils,
} from "lucide-react";

interface CookProViewProps {
  incoming: Order[];
  preparing: Order[];
  loadingOrders: boolean;
  accepting: Set<string>;
  printing: Set<string>;
  actingIds: Set<string>;
  onAccept: (id: string) => void;
  onAcceptWithPrint: (order: Order) => void;
  onCancel: (id: string) => void;
  onMarkReady: (id: string) => void;
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

const formatTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const CookProView = ({
  incoming,
  preparing,
  loadingOrders,
  accepting,
  printing,
  actingIds,
  onAccept,
  onAcceptWithPrint,
  onCancel,
  onMarkReady,
}: CookProViewProps) => {
  const { t } = useTranslation();

  const stats = useMemo(() => {
    const totalItems = [...incoming, ...preparing].reduce(
      (sum, o) => sum + (o.items?.length || 0),
      0
    );
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
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{incoming.length}</p>
            <p className="text-xs text-muted-foreground">{t("cook.pending", { defaultValue: "Pending" })}</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-secondary/20 flex items-center justify-center">
            <ChefHat className="h-5 w-5 text-secondary-foreground" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{preparing.length}</p>
            <p className="text-xs text-muted-foreground">{t("cook.preparing", { defaultValue: "Preparing" })}</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-accent/20 flex items-center justify-center">
            <Utensils className="h-5 w-5 text-accent-foreground" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{stats.totalItems}</p>
            <p className="text-xs text-muted-foreground">{t("cook.total_items", { defaultValue: "Items" })}</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
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
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Incoming Orders Column */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 pb-2 border-b border-border">
            <div className="h-3 w-3 rounded-full bg-amber-500 animate-pulse" />
            <h2 className="text-lg font-semibold text-foreground">
              {t("cook.incoming_orders")}
            </h2>
            <Badge variant="secondary" className="ml-auto">
              {incoming.length}
            </Badge>
          </div>

          <div className="space-y-3 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
            {incoming.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>{t("cook.no_incoming", { defaultValue: "No pending orders" })}</p>
              </div>
            ) : (
              incoming.map((order, idx) => {
                const elapsed = getElapsedMinutes(order.createdAt);
                const urgency = getUrgencyLevel(elapsed);
                return (
                  <div
                    key={order.id}
                    className={clsx(
                      "bg-card border rounded-xl p-4 transition-all duration-300 hover:shadow-lg",
                      urgency === "critical" && "border-destructive/50 bg-destructive/5",
                      urgency === "warning" && "border-amber-500/50 bg-amber-500/5",
                      urgency === "normal" && "border-border hover:border-primary/30"
                    )}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-gradient-primary flex items-center justify-center text-primary-foreground font-bold text-sm shadow">
                          {order.tableLabel}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">
                              {formatTableLabel(order.tableLabel)}
                            </span>
                            <Badge
                              variant="outline"
                              className={clsx(
                                "text-[10px] px-1.5",
                                urgency === "critical" && "border-destructive text-destructive",
                                urgency === "warning" && "border-amber-500 text-amber-600"
                              )}
                            >
                              #{idx + 1}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Timer className="h-3 w-3" />
                            <span>{formatTime(order.createdAt)}</span>
                            <span className={clsx(
                              "font-medium",
                              urgency === "critical" && "text-destructive",
                              urgency === "warning" && "text-amber-600"
                            )}>
                              ({elapsed}m)
                            </span>
                          </div>
                        </div>
                      </div>
                      <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-400 border-0">
                        {order.items?.length || 0} items
                      </Badge>
                    </div>

                    {/* Items */}
                    <div className="bg-muted/50 rounded-lg p-3 mb-3 space-y-1.5">
                      {(order.items ?? []).slice(0, 5).map((line: CartItem, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <span className="h-5 w-5 rounded bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                            {line.quantity}
                          </span>
                          <span className="text-foreground">{line.item?.name || "Item"}</span>
                        </div>
                      ))}
                      {(order.items?.length || 0) > 5 && (
                        <p className="text-xs text-muted-foreground pl-7">
                          +{(order.items?.length || 0) - 5} more...
                        </p>
                      )}
                    </div>

                    {order.note && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 mb-3 text-xs text-amber-700 dark:text-amber-400">
                        📝 {order.note}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-primary hover:bg-primary/90"
                        onClick={() => onAccept(order.id)}
                        disabled={accepting.has(order.id)}
                      >
                        {accepting.has(order.id) ? (
                          <span className="h-4 w-4 border-2 border-current/40 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            {t("actions.accept")}
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onAcceptWithPrint(order)}
                        disabled={printing.has(order.id)}
                      >
                        {printing.has(order.id) ? (
                          <span className="h-4 w-4 border-2 border-current/40 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Printer className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => onCancel(order.id)}
                        disabled={actingIds.has(`cancel:${order.id}`)}
                      >
                        {actingIds.has(`cancel:${order.id}`) ? (
                          <span className="h-4 w-4 border-2 border-current/40 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Preparing Orders Column */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 pb-2 border-b border-border">
            <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
            <h2 className="text-lg font-semibold text-foreground">
              {t("cook.in_preparation")}
            </h2>
            <Badge variant="secondary" className="ml-auto">
              {preparing.length}
            </Badge>
          </div>

          <div className="space-y-3 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
            {preparing.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ChefHat className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>{t("cook.no_preparing", { defaultValue: "Nothing cooking" })}</p>
              </div>
            ) : (
              preparing.map((order) => {
                const elapsed = getElapsedMinutes(order.createdAt);
                const urgency = getUrgencyLevel(elapsed);
                return (
                  <div
                    key={order.id}
                    className={clsx(
                      "bg-card border rounded-xl p-4 transition-all duration-300 hover:shadow-lg",
                      urgency === "critical" && "border-destructive/50",
                      urgency === "warning" && "border-amber-500/50",
                      urgency === "normal" && "border-border hover:border-primary/30"
                    )}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-gradient-secondary flex items-center justify-center text-secondary-foreground font-bold text-sm shadow">
                          {order.tableLabel}
                        </div>
                        <div>
                          <span className="font-semibold text-foreground">
                            {formatTableLabel(order.tableLabel)}
                          </span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Timer className="h-3 w-3" />
                            <span>{formatTime(order.createdAt)}</span>
                            <span className={clsx(
                              "font-medium",
                              urgency === "critical" && "text-destructive",
                              urgency === "warning" && "text-amber-600"
                            )}>
                              ({elapsed}m cooking)
                            </span>
                          </div>
                        </div>
                      </div>
                      {typeof order.priority === "number" && (
                        <Badge variant="outline" className="text-xs">
                          Priority #{order.priority}
                        </Badge>
                      )}
                    </div>

                    {/* Items */}
                    <div className="bg-muted/50 rounded-lg p-3 mb-3 space-y-1.5">
                      {(order.items ?? []).map((line: CartItem, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <span className="h-5 w-5 rounded bg-secondary/20 text-secondary-foreground text-xs font-bold flex items-center justify-center">
                            {line.quantity}
                          </span>
                          <span className="text-foreground">{line.item?.name || "Item"}</span>
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => onMarkReady(order.id)}
                      disabled={actingIds.has(`ready:${order.id}`)}
                    >
                      {actingIds.has(`ready:${order.id}`) ? (
                        <span className="h-4 w-4 border-2 border-current/40 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          {t("actions.mark_ready")}
                        </>
                      )}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
