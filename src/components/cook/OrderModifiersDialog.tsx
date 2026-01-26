import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MenuItem, Order } from "@/types";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatTableLabel } from "@/lib/formatTableLabel";

type ResolvedModifier = {
  modifierId: string;
  optionId: string;
  modifierLabel: string;
  optionLabel: string;
};

type ResolvedLine = {
  line: Order["items"][number];
  itemName: string;
  selections: ResolvedModifier[];
};

type OrderModifiersDialogProps = {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const formatTime = (dateStr?: string) => {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export function OrderModifiersDialog({
  order,
  open,
  onOpenChange,
}: OrderModifiersDialogProps) {
  const { t } = useTranslation();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [menuLoaded, setMenuLoaded] = useState(false);

  useEffect(() => {
    if (!open || menuLoaded) return;
    let active = true;
    api
      .getMenu()
      .then((menu) => {
        if (!active) return;
        setMenuItems(menu?.items ?? []);
      })
      .catch((error) => {
        console.warn("Failed to load menu for modifiers dialog", error);
      })
      .finally(() => {
        if (active) setMenuLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [open, menuLoaded]);

  const menuLookup = useMemo(() => {
    const map = new Map<string, MenuItem>();
    menuItems.forEach((item) => {
      if (item?.id) map.set(item.id, item);
    });
    return map;
  }, [menuItems]);

  const resolvedItems = useMemo<ResolvedLine[]>(() => {
    if (!order?.items?.length) return [];
    return order.items.map((line, index) => {
      const itemId = line.item?.id;
      const menuItem =
        line.item?.modifiers?.length ? line.item : itemId ? menuLookup.get(itemId) : undefined;
      const itemName =
        line.item?.name ||
        line.item?.title ||
        menuItem?.name ||
        menuItem?.title ||
        `Item ${index + 1}`;
      const selections = Object.entries(line.selectedModifiers ?? {}).map(
        ([modifierId, optionId]) => {
          const modifier = menuItem?.modifiers?.find((mod) => mod.id === modifierId);
          const option = modifier?.options?.find((opt) => opt.id === optionId);
          return {
            modifierId,
            optionId,
            modifierLabel: modifier?.name || modifier?.title || modifierId,
            optionLabel:
              option?.label ||
              option?.title ||
              line.selectedModifierLabels?.[modifierId] ||
              optionId,
          };
        }
      );
      return { line, itemName, selections };
    });
  }, [order, menuLookup]);

  if (!order) return null;

  const note = order.note?.trim();
  const orderTime = formatTime(order.createdAt);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2">
            <span>{t("cook.modifiers_title", { defaultValue: "Order modifiers" })}</span>
            {order.tableLabel && (
              <Badge variant="outline">{formatTableLabel(order.tableLabel)}</Badge>
            )}
            <Badge variant="secondary" className="ml-auto">
              {resolvedItems.length} items
            </Badge>
          </DialogTitle>
          <div className="text-xs text-muted-foreground flex items-center gap-3">
            {orderTime && <span>{orderTime}</span>}
            <span>{t("status." + order.status, { defaultValue: order.status })}</span>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-3">
            {resolvedItems.map((item, idx) => (
              <div key={`${item.itemName}-${idx}`} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">
                    {item.line.quantity}x {item.itemName}
                  </p>
                </div>
                {item.selections.length > 0 ? (
                  <div className="mt-2 space-y-1 text-sm">
                    {item.selections.map((selection) => (
                      <div key={`${selection.modifierId}-${selection.optionId}`} className="flex gap-2">
                        <span className="text-muted-foreground">{selection.modifierLabel}:</span>
                        <span className="text-foreground">{selection.optionLabel}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("cook.no_modifiers_for_item", {
                      defaultValue: "No modifiers for this item.",
                    })}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <p className="text-xs font-semibold text-muted-foreground">
              {t("cook.order_description", { defaultValue: "Order description" })}
            </p>
            <p className="text-sm text-foreground mt-1">
              {note || t("cook.no_description", { defaultValue: "No description provided." })}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
