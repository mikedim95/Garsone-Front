import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { CategorySelectView } from "@/components/menu/CategorySelectView";
import { ElegantMenuView } from "@/components/menu/ElegantMenuView";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { useCartStore } from "@/store/cartStore";
import type {
  MenuCategory,
  MenuItem,
  Modifier,
  ModifierOption,
  Order,
  OrderingMode,
} from "@/types";
import { MenuSkeleton } from "@/features/menu/MenuSkeleton";
import { ArrowLeft } from "lucide-react";

const ModifierDialog = lazy(() =>
  import("@/components/menu/ModifierDialog").then((mod) => ({
    default: mod.ModifierDialog,
  }))
);

type CategorySummary = Pick<
  MenuCategory,
  "id" | "title" | "titleEn" | "titleEl" | "printerTopic"
>;
type MenuModifierLink = {
  itemId: string;
  modifierId: string;
  isRequired?: boolean;
};
interface MenuStateData {
  categories: CategorySummary[];
  items: MenuItem[];
  modifiers: Modifier[];
  modifierOptions: ModifierOption[];
  itemModifiers: MenuModifierLink[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const mapCategories = (
  categories?: Array<{ id?: string; title?: string; printerTopic?: string | null }>
): CategorySummary[] =>
  (categories ?? []).reduce<CategorySummary[]>((acc, category, index) => {
    if (!category) return acc;
    const id = category.id ?? `cat-${index}`;
    const title = category.title ?? "";
    if (!title) return acc;
    acc.push({
      id,
      title,
      printerTopic:
        typeof (category as { printerTopic?: string | null }).printerTopic ===
        "string"
          ? (category as { printerTopic?: string | null }).printerTopic
          : null,
    });
    return acc;
  }, []);

const buildMenuState = (
  payload: Partial<MenuStateData> & {
    categories?: Array<{
      id?: string;
      title?: string;
      titleEn?: string;
      titleEl?: string;
      printerTopic?: string | null;
    }>;
    items?: MenuItem[];
  } = {},
  preferGreek: boolean
): MenuStateData => {
  const localizeText = (en?: string, el?: string, fallback?: string) =>
    preferGreek ? el || en || fallback || "" : en || el || fallback || "";

  const localizedModifiers = (mods?: Modifier[]) =>
    (mods ?? [])
      .filter((m) => m.isAvailable !== false)
      .map((m) => ({
        ...m,
        name: localizeText(m.titleEn, m.titleEl, m.name),
        options: (m.options ?? []).map((opt) => ({
          ...opt,
          label: localizeText(opt.titleEn, opt.titleEl, opt.label),
        })),
      }));

  return {
    categories: mapCategories(
      (payload?.categories ?? []).map((cat) => ({
        ...cat,
        title: localizeText(cat.titleEn, cat.titleEl, cat.title),
      }))
    ),
    items: (payload?.items ?? []).map((item) => {
      const name = localizeText(
        item.titleEn || item.name,
        item.titleEl,
        item.name || item.title
      );
      const description = localizeText(
        item.descriptionEn,
        item.descriptionEl,
        item.description
      );
      const imageUrl = item.imageUrl ?? item.image ?? "";
      return {
        ...item,
        name,
        displayName: name,
        displayDescription: description,
        description,
        image: imageUrl,
        imageUrl,
        modifiers: localizedModifiers(item.modifiers),
      };
    }),
    modifiers: localizedModifiers(payload?.modifiers),
    modifierOptions: payload?.modifierOptions ?? [],
    itemModifiers: payload?.itemModifiers ?? [],
  };
};

const normalizePrinterTopicValue = (value?: string | null) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const filterMenuByPrinterTopic = (
  data: MenuStateData,
  topic?: string | null
): MenuStateData => {
  const normalized = normalizePrinterTopicValue(topic);
  if (!normalized) return data;
  const allowedCategoryIds = new Set(
    data.categories
      .filter(
        (category) =>
          normalizePrinterTopicValue(category.printerTopic) === normalized
      )
      .map((category) => category.id)
  );
  return {
    ...data,
    categories: data.categories.filter((category) =>
      allowedCategoryIds.has(category.id)
    ),
    items: data.items.filter(
      (item) => !item.categoryId || allowedCategoryIds.has(item.categoryId)
    ),
  };
};

type WaiterMenuTabProps = {
  storeSlug?: string;
  assignedTables: Array<{ id: string; label: string }>;
  orderingMode: OrderingMode;
  printerTopic?: string | null;
  onOrderCreated: (order: Order) => void;
};

export function WaiterMenuTab({
  storeSlug,
  assignedTables,
  orderingMode,
  printerTopic,
  onOrderCreated,
}: WaiterMenuTabProps) {
  const { t, i18n } = useTranslation();
  const preferGreek = i18n.language?.toLowerCase().startsWith("el");
  const { toast } = useToast();

  const addItem = useCartStore((s) => s.addItem);
  const clearCart = useCartStore((s) => s.clearCart);

  const [selectedTable, setSelectedTable] = useState<string>(
    assignedTables[0]?.id ?? ""
  );
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [categorySelected, setCategorySelected] = useState(true);
  const [menuData, setMenuData] = useState<MenuStateData | null>(null);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [menuReload, setMenuReload] = useState(0);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [customizeItem, setCustomizeItem] = useState<MenuItem | null>(null);
  const [orderPlacedSignal, setOrderPlacedSignal] = useState(0);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [openCartSignal, setOpenCartSignal] = useState(0);

  useEffect(() => {
    if (!assignedTables.some((t) => t.id === selectedTable)) {
      setSelectedTable(assignedTables[0]?.id ?? "");
    }
  }, [assignedTables, selectedTable]);

  useEffect(() => {
    clearCart();
    setCategorySelected(true);
    setSelectedCategory("all");
    setMenuData(null);
  }, [selectedTable, clearCart]);

  useEffect(() => {
    if (!selectedTable) {
      setMenuData(null);
      return;
    }
    let cancelled = false;
    setMenuLoading(true);
    setMenuError(null);
    api
      .getMenuBootstrap(selectedTable, {
        storeSlug: storeSlug || undefined,
      })
      .then((res) => {
        if (cancelled) return;
        const built = buildMenuState(
          {
            categories: res.menu.categories,
            items: res.menu.items,
            modifiers: res.menu.modifiers || [],
            modifierOptions: (res.menu as any).modifierOptions || [],
            itemModifiers: res.menu.itemModifiers || [],
          },
          preferGreek
        );
        setMenuData(filterMenuByPrinterTopic(built, printerTopic));
      })
      .catch((error) => {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : t("menu.load_error_title", {
                defaultValue: "Failed to load menu",
              });
        setMenuError(message);
        setMenuData(null);
      })
      .finally(() => {
        if (!cancelled) {
          setMenuLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTable, storeSlug, preferGreek, printerTopic, t, menuReload]);

  const currentTableLabel = useMemo(
    () => assignedTables.find((t) => t.id === selectedTable)?.label,
    [assignedTables, selectedTable]
  );

  const categories = menuData ? menuData.categories : [];

  const handleAddItem = (item: MenuItem) => {
    setCustomizeItem(item);
    setCustomizeOpen(true);
  };

  const handleConfirmModifiers = (
    selected: Record<string, string>,
    qty: number
  ) => {
    if (!customizeItem) return;
    addItem({
      item: customizeItem,
      quantity: Math.max(1, qty || 1),
      selectedModifiers: selected,
    });
    toast({
      title: t("menu.toast_added_title", { defaultValue: "Added to cart" }),
      description: customizeItem.name,
    });
    setCustomizeOpen(false);
    setCustomizeItem(null);
  };

  const handlePlaceOrder = async (note?: string) => {
    if (!selectedTable) {
      toast({
        title: t("waiter.no_table_title", { defaultValue: "Pick a table" }),
        description: t("waiter.no_table_desc", {
          defaultValue: "Select a table before placing an order.",
        }),
      });
      return null;
    }

    const cartItems = useCartStore.getState().items;
    if (!cartItems.length) {
      toast({
        title: t("menu.toast_error_title", {
          defaultValue: "Cart is empty",
        }),
        description: t("menu.toast_error_description", {
          defaultValue: "Add items to your cart before placing the order.",
        }),
      });
      return null;
    }

    try {
      setCheckoutBusy(true);
      const payload = {
        tableId: selectedTable,
        items: cartItems.map((item) => ({
          itemId: item.item.id,
          quantity: item.quantity,
          modifiers: JSON.stringify(item.selectedModifiers),
        })),
        ...(note ? { note } : {}),
      };
      const res = await api.createOrder(payload);
      const created =
        (res as any)?.order && isRecord((res as any).order)
          ? (res as any).order
          : null;
      if (!created) {
        throw new Error("Order was not created");
      }
      const order: Order = {
        ...(created as Order),
        tableId: (created as any).tableId || selectedTable,
        tableLabel:
          (created as any).tableLabel ||
          currentTableLabel ||
          (created as any).tableId ||
          selectedTable,
      };
      onOrderCreated(order);
      clearCart();
      setOrderPlacedSignal((s) => s + 1);
      setCategorySelected(true);
      setSelectedCategory("all");
      toast({
        title: t("waiter.order_created", {
          defaultValue: "Order placed",
        }),
        description: currentTableLabel
          ? t("waiter.order_created_desc", {
              table: currentTableLabel,
              defaultValue: `Sent to ${currentTableLabel}`,
            })
          : undefined,
      });
      return order;
    } catch (error) {
      toast({
        title: t("waiter.order_failed", {
          defaultValue: "Could not place order",
        }),
        description:
          error instanceof Error
            ? error.message
            : t("menu.toast_error_description", {
                defaultValue: "Please try again in a moment.",
              }),
      });
      return null;
    } finally {
      setCheckoutBusy(false);
    }
  };

  if (!assignedTables.length) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/60 p-6">
        <p className="text-sm font-semibold text-foreground">
          {t("waiter.no_tables_assigned", {
            defaultValue: "No tables assigned",
          })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("waiter.no_tables_message", {
            defaultValue: "Ask a manager to assign tables so you can place orders.",
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border/60 bg-card/70 shadow-lg p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="space-y-1">
          <p className="text-lg font-semibold text-foreground">
            {t("waiter.place_order", { defaultValue: "Place an order" })}
          </p>
          <p className="text-sm text-muted-foreground">
            {orderingMode === "waiter"
              ? t("waiter.waiter_only_hint", {
                  defaultValue:
                    "Guests browse with QR; you submit orders from here.",
                })
              : t("waiter.hybrid_hint", {
                  defaultValue:
                    "Guests can order via QR or you can submit on their behalf.",
                })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={selectedTable}
            onValueChange={(val) => setSelectedTable(val)}
            disabled={menuLoading}
          >
            <SelectTrigger className="w-[190px]">
              <SelectValue
                placeholder={t("waiter.pick_table", {
                  defaultValue: "Select table",
                })}
              />
            </SelectTrigger>
            <SelectContent>
              {assignedTables.map((table) => (
                <SelectItem key={table.id} value={table.id}>
                  {table.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="secondary"
            size="sm"
            className="rounded-full"
            onClick={() => setOpenCartSignal((s) => s + 1)}
          >
            {t("menu.cart", { defaultValue: "Cart" })}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              clearCart();
              setCategorySelected(true);
              setSelectedCategory("all");
            }}
          >
            {t("actions.reset", { defaultValue: "Reset" })}
          </Button>
        </div>
      </div>

      {menuLoading ? (
        <MenuSkeleton />
      ) : menuError ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-destructive">{menuError}</p>
          <Button
            onClick={() => {
              setMenuError(null);
              setMenuReload((s) => s + 1);
            }}
          >
            {t("actions.retry", { defaultValue: "Retry" })}
          </Button>
        </div>
      ) : !menuData ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          {t("waiter.select_table_prompt", {
            defaultValue: "Select a table to load its menu.",
          })}
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {!categorySelected ? (
            <CategorySelectView
              key="waiter-category-select"
              categories={categories}
              loading={menuLoading}
              onSelect={(catId) => {
                setSelectedCategory(catId);
                setCategorySelected(true);
              }}
            />
          ) : (
            <motion.div
              key="waiter-menu-view"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="flex gap-2 mb-6 overflow-x-auto pb-2 items-center"
            >
                <Button
                  key="all"
                  variant={selectedCategory === "all" ? "default" : "outline"}
                  onClick={() => setSelectedCategory("all")}
                  className="shrink-0 rounded-full h-9 text-sm"
                >
                  {t("menu.category_all", { defaultValue: "All" })}
                </Button>
                {categories.map((cat) => (
                  <Button
                    key={cat.id}
                    variant={selectedCategory === cat.id ? "default" : "outline"}
                    onClick={() => setSelectedCategory(cat.id)}
                    className="shrink-0 rounded-full h-9 text-sm"
                  >
                    {cat.title}
                  </Button>
                ))}
              </motion.div>

              <ElegantMenuView
                categories={categories}
                items={menuData.items}
                selectedCategory={selectedCategory || "all"}
                onAddItem={handleAddItem}
                onCheckout={handlePlaceOrder}
                onImmediateCheckout={handlePlaceOrder}
                showPaymentButton={false}
                secondaryCtaLabel={t("waiter.place_order_cta", {
                  defaultValue: "Place order",
                })}
                orderPlacedSignal={orderPlacedSignal}
                openCartSignal={openCartSignal}
                checkoutBusy={checkoutBusy}
                showCallButton={false}
                autoOpenCart={false}
                showCartButton={true}
                floatingCartPosition="none"
              />
            </motion.div>
          )}
        </AnimatePresence>
      )}

      <Suspense fallback={null}>
        <ModifierDialog
          open={customizeOpen}
          item={customizeItem}
          onClose={() => setCustomizeOpen(false)}
          onConfirm={(selected, qty) => handleConfirmModifiers(selected, qty)}
        />
      </Suspense>
    </div>
  );
}
