import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, ImagePlus, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { ManagerItemSummary, ManagerItemPayload, MenuCategory, Modifier, ModifierOption, StaffType } from '@/types';
import { useToast } from '@/hooks/use-toast';

type CustomOption = { id?: string; titleEn: string; titleEl: string; price: string };
type CustomModifier = {
  id?: string;
  titleEn: string;
  titleEl: string;
  required: boolean;
  selectionMode: 'single' | 'multiple';
  isAvailable: boolean;
  options: CustomOption[];
  originalOptionIds?: string[];
};
type CategoryForm = { titleEn: string; titleEl: string; sortOrder: string; imageUrl: string };
type SubcategorySummary = {
  key: string;
  categoryId: string;
  titleEn: string;
  titleEl: string;
  itemCount: number;
  items: ManagerItemSummary[];
};
type SubcategoryForm = {
  categoryId: string;
  titleEn: string;
  titleEl: string;
};
type ItemForm = {
  titleEn: string;
  titleEl: string;
  subcategoryEn: string;
  subcategoryEl: string;
  descriptionEn: string;
  descriptionEl: string;
  imageUrl: string;
  price: string;
  categoryId: string;
  newCategoryTitle: string;
  isAvailable: boolean;
  printerTopic: string;
};

const NOOR_CATEGORY_IMAGE_BASE_URL =
  'https://order-flow-api-3uuy.onrender.com/media/garsone-media/noor/Menu';

const categoryImagePool = [
  { label: 'Coffee', url: `${NOOR_CATEGORY_IMAGE_BASE_URL}/cappuccino.webp` },
  { label: 'Beverages', url: `${NOOR_CATEGORY_IMAGE_BASE_URL}/natural-juice.webp` },
  { label: 'Drinks', url: `${NOOR_CATEGORY_IMAGE_BASE_URL}/drink-special.webp` },
  { label: 'Beer', url: `${NOOR_CATEGORY_IMAGE_BASE_URL}/beer-corona.webp` },
  { label: 'Shisha', url: `${NOOR_CATEGORY_IMAGE_BASE_URL}/shisha-special-love66.webp` },
  { label: 'Food', url: `${NOOR_CATEGORY_IMAGE_BASE_URL}/mixed-grill.webp` },
];

const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024;

export const ManagerMenuPanel = () => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const activeLanguage = (i18n.resolvedLanguage || i18n.language || 'el').toLowerCase();
  const preferGreek = activeLanguage.startsWith('el');

  const [items, setItems] = useState<ManagerItemSummary[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);

  const [storeSlug, setStoreSlug] = useState<string>('');
  const [cookTypes, setCookTypes] = useState<StaffType[]>([]);
  const [waiterTypes, setWaiterTypes] = useState<StaffType[]>([]);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ManagerItemSummary | null>(null);
  const [form, setForm] = useState<ItemForm>({
    titleEn: '',
    titleEl: '',
    subcategoryEn: '',
    subcategoryEl: '',
    descriptionEn: '',
    descriptionEl: '',
    imageUrl: '',
    price: '0.00',
    categoryId: '',
    newCategoryTitle: '',
    isAvailable: true,
    printerTopic: '',
  });
  const [savingItem, setSavingItem] = useState(false);

  // Modifiers editor state for the current item
  const [customMods, setCustomMods] = useState<CustomModifier[]>([]);
  const [originalModifierIds, setOriginalModifierIds] = useState<Set<string>>(new Set());

  // UI helpers
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [showDisabled, setShowDisabled] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [imageUploadStatus, setImageUploadStatus] = useState('');

  // Category edit modal
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>({
    titleEn: '',
    titleEl: '',
    sortOrder: '0',
    imageUrl: '',
  });
  const [savingCategory, setSavingCategory] = useState(false);
  const [categoryDialogMode, setCategoryDialogMode] = useState<'create' | 'edit'>('edit');
  const [subcategoryDialogOpen, setSubcategoryDialogOpen] = useState(false);
  const [subcategoryDialogMode, setSubcategoryDialogMode] = useState<'create' | 'edit'>('edit');
  const [editingSubcategory, setEditingSubcategory] = useState<SubcategorySummary | null>(null);
  const [subcategoryForm, setSubcategoryForm] = useState<SubcategoryForm>({
    categoryId: '',
    titleEn: '',
    titleEl: '',
  });
  const [draftSubcategories, setDraftSubcategories] = useState<SubcategorySummary[]>([]);
  const [savingSubcategory, setSavingSubcategory] = useState(false);

  const normalizePrinterTopicValue = (value?: string | null) =>
    typeof value === 'string' ? value.trim().toLowerCase() : '';

  type CookTypeOption = { id: string; title: string; printerTopic: string };
  const cookTypeOptions = useMemo(() => {
    return cookTypes
      .map((type) => {
        const printerTopic = normalizePrinterTopicValue(type.printerTopic);
        if (!printerTopic) return null;
        const title = (type.title || type.slug || printerTopic).trim();
        return { id: type.id, title, printerTopic };
      })
      .filter((opt): opt is CookTypeOption => Boolean(opt));
  }, [cookTypes]);

  const resolveItemPrinter = (value?: string | null) => {
    const trimmed = normalizePrinterTopicValue(value);
    if (trimmed) return trimmed;
    return cookTypeOptions[0]?.printerTopic ?? '';
  };

  const selectedPrinterTopic = normalizePrinterTopicValue(form.printerTopic);
  const cookTypeTopics = useMemo(
    () => new Set(cookTypeOptions.map((opt) => opt.printerTopic)),
    [cookTypeOptions]
  );
  const showLegacyPrinter =
    selectedPrinterTopic.length > 0 && !cookTypeTopics.has(selectedPrinterTopic);
  const displayCookTypeOptions = showLegacyPrinter
    ? [
        {
          id: 'legacy-printer',
          title: `Unassigned (${selectedPrinterTopic})`,
          printerTopic: selectedPrinterTopic,
        },
        ...cookTypeOptions,
      ]
    : cookTypeOptions;

  const localizedCategoryTitle = (category?: MenuCategory | null) => {
    if (!category) return '';
    const en = category.titleEn?.trim();
    const el = category.titleEl?.trim();
    const fallback = category.title?.trim() || en || el || '';
    return preferGreek ? el || fallback : en || fallback;
  };

  const localizedSubcategoryTitle = (subcategory?: Pick<SubcategorySummary, 'titleEn' | 'titleEl'> | null) => {
    if (!subcategory) return '';
    const en = subcategory.titleEn?.trim();
    const el = subcategory.titleEl?.trim();
    return preferGreek ? el || en || '' : en || el || '';
  };

  const subcategoryKey = (categoryId: string, en?: string | null, el?: string | null) =>
    `${categoryId}|${(en || '').trim().toLowerCase()}|${(el || '').trim().toLowerCase()}`;

  const itemMatchesCategory = (item: ManagerItemSummary, category: MenuCategory) =>
    item.categoryId === category.id || item.category === category.title || item.category === category.titleEn || item.category === category.titleEl;

  const load = useCallback(async () => {
    try {
      const [itemsRes, categoriesRes, storeRes, cookTypesRes, waiterTypesRes] = await Promise.all([
        api.listItems(),
        api.listCategories(),
        api.getStore(),
        api.listCookTypes(),
        api.listWaiterTypes(),
      ]);
      setItems(itemsRes.items ?? []);
      setCategories(
        (categoriesRes.categories ?? []).map((c) => ({
          ...c,
          title: c.title || c.titleEn || c.titleEl || '',
        }))
      );
      setCookTypes(cookTypesRes.types ?? []);
      setWaiterTypes(waiterTypesRes.types ?? []);
      if (storeRes?.store?.slug) setStoreSlug(storeRes.store.slug);
    } catch (error) {
      console.error('Failed to load menu data', error);
      toast({ title: 'Load failed', description: 'Could not load menu data' });
    }
  }, [toast]);

  useEffect(() => {
    (async () => {
      try {
        const store = await api.getStore();
        if (store?.store?.name) {
          try {
            localStorage.setItem('STORE_NAME', store.store.name);
          } catch (error) {
            console.warn('Failed to persist STORE_NAME', error);
          }
        }
        if (store?.store?.slug) setStoreSlug(store.store.slug);
      } catch (error) {
        console.error('Failed to load store info', error);
      }
    })();
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!imagePreview.startsWith('blob:')) return undefined;
    return () => URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  const selectImageFile = (file: File | null) => {
    if (!file) {
      setImageFile(null);
      setImagePreview(form.imageUrl || '');
      setImageUploadStatus('');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Upload failed', description: 'Choose an image file.' });
      return;
    }
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      toast({ title: 'Upload failed', description: 'Image must be 8 MB or smaller.' });
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageUploadStatus('Ready to upload');
  };

  const withFreshImageVersion = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return trimmed;
    return `${trimmed}${trimmed.includes('?') ? '&' : '?'}v=${Date.now()}`;
  };

  const openCategoryCreate = () => {
    setCategoryForm({ titleEn: '', titleEl: '', sortOrder: String(categories.length * 10), imageUrl: '' });
    setEditingCategory(null);
    setCategoryDialogMode('create');
    setCategoryDialogOpen(true);
  };

  const openCategoryEdit = (cat: MenuCategory) => {
    setCategoryForm({
      titleEn: cat.titleEn || cat.title || '',
      titleEl: cat.titleEl || cat.title || cat.titleEn || '',
      sortOrder: String(cat.sortOrder ?? 0),
      imageUrl: cat.imageUrl || '',
    });
    setEditingCategory(cat);
    setCategoryDialogMode('edit');
    setCategoryDialogOpen(true);
  };

  const saveCategoryEdit = async () => {
    const fallbackEn = editingCategory?.titleEn || editingCategory?.title || '';
    const fallbackEl = editingCategory?.titleEl || editingCategory?.title || fallbackEn;
    const titleEn = categoryForm.titleEn.trim() || fallbackEn;
    const titleEl = categoryForm.titleEl.trim() || fallbackEl || titleEn;
    const sortOrder = Number.parseInt(categoryForm.sortOrder, 10);
    const imageUrl = categoryForm.imageUrl.trim();
    if (!titleEn || !titleEl) {
      toast({ title: 'Title required', description: 'Both English and Greek category names are required.' });
      return;
    }
    setSavingCategory(true);
    try {
      if (categoryDialogMode === 'create') {
        await api.createCategory(titleEn, titleEl, Number.isFinite(sortOrder) ? sortOrder : undefined, undefined, imageUrl || null);
        toast({ title: 'Category added', description: titleEn });
      } else if (editingCategory) {
        await api.updateCategory(editingCategory.id, {
          titleEn,
          titleEl,
          imageUrl: imageUrl || null,
          ...(Number.isFinite(sortOrder) ? { sortOrder } : {}),
        });
        toast({ title: 'Category updated', description: titleEn });
      }
      await load();
      setCategoryDialogOpen(false);
      setEditingCategory(null);
      setCategoryDialogMode('edit');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update category';
      const failureTitle = categoryDialogMode === 'create' ? 'Create failed' : 'Update failed';
      toast({ title: failureTitle, description: message });
    } finally {
      setSavingCategory(false);
    }
  };

  const openAdd = (prefCategoryId?: string) => {
    setEditing(null);
    const fallbackCategory = prefCategoryId || categories[0]?.id || '';
    setForm({
      titleEn: '',
      titleEl: '',
      subcategoryEn: '',
      subcategoryEl: '',
      descriptionEn: '',
      descriptionEl: '',
      imageUrl: '',
      price: '0.00',
      categoryId: fallbackCategory,
      newCategoryTitle: '',
      isAvailable: true,
      printerTopic: resolveItemPrinter(),
    });
    setImageFile(null);
    setImagePreview('');
    setImageUploadStatus('');
    setCustomMods([]);
    setOriginalModifierIds(new Set());
    setModalOpen(true);
  };

  const openEdit = async (item: ManagerItemSummary) => {
    setEditing(item);
    const selectedPrinter = resolveItemPrinter(item.printerTopic);
    setForm({
      titleEn: item.titleEn ?? item.title ?? item.name ?? '',
      titleEl: item.titleEl ?? item.title ?? item.name ?? '',
      subcategoryEn: item.subcategoryEn ?? item.subcategory ?? '',
      subcategoryEl: item.subcategoryEl ?? item.subcategory ?? '',
      descriptionEn: item.descriptionEn ?? item.description ?? '',
      descriptionEl: item.descriptionEl ?? item.description ?? '',
      // Prefer the backend URL so images load directly via /menu response.
      imageUrl: item.imageUrl ?? item.image ?? '',
      price: typeof item.priceCents === 'number' ? (item.priceCents / 100).toFixed(2) : '0.00',
      categoryId: item.categoryId ?? '',
      newCategoryTitle: '',
      isAvailable: item.isAvailable ?? true,
      printerTopic: selectedPrinter,
    });
    setImageFile(null);
    setImagePreview(item.imageUrl ?? item.image ?? '');
    setImageUploadStatus('');
    try {
      const detail = await api.getItemDetail(item.id);
      const links = detail.links || [];
      const mods = detail.modifiers || [];
      setOriginalModifierIds(new Set(links.map((l) => l.modifierId)));
      setCustomMods(
        mods.map((mod) => ({
          id: mod.id,
          titleEn: mod.titleEn || mod.title || '',
          titleEl: mod.titleEl || mod.title || '',
          required: links.find((l) => l.modifierId === mod.id)?.isRequired ?? mod.minSelect > 0,
          selectionMode: mod.maxSelect === 1 ? 'single' : 'multiple',
          isAvailable: mod.isAvailable ?? true,
          options: (mod.options || (mod as any).modifierOptions || []).map((opt: any) => ({
            id: opt.id,
            titleEn: opt.titleEn || opt.title || opt.label || '',
            titleEl: opt.titleEl || opt.title || opt.label || '',
            price: ((opt.priceDeltaCents ?? opt.priceDelta ?? 0) / 100).toFixed(2),
          })),
          originalOptionIds: (mod.options || (mod as any).modifierOptions || [])
            .map((o: any) => o.id || '')
            .filter(Boolean),
        }))
      );
    } catch (error) {
      console.error('Failed to load item modifiers', error);
      setCustomMods([]);
      setOriginalModifierIds(new Set());
    }
    setModalOpen(true);
  };

  const taxonomyGroups = useMemo(() => {
    return categories.map((category) => {
      const allItems = items.filter((item) => itemMatchesCategory(item, category));
      const visibleItems = allItems.filter((item) => (showDisabled ? true : item.isAvailable !== false));
      const subcategoryMap = new Map<string, SubcategorySummary>();
      for (const item of allItems) {
        const titleEn = (item.subcategoryEn || item.subcategory || '').trim();
        const titleEl = (item.subcategoryEl || item.subcategory || '').trim();
        if (!titleEn && !titleEl) continue;
        const key = subcategoryKey(category.id, titleEn, titleEl);
        const group =
          subcategoryMap.get(key) ?? {
            key,
            categoryId: category.id,
            titleEn,
            titleEl,
            itemCount: 0,
            items: [],
          };
        group.itemCount += 1;
        group.items.push(item);
        subcategoryMap.set(key, group);
      }
      for (const draft of draftSubcategories.filter((draft) => draft.categoryId === category.id)) {
        if (!subcategoryMap.has(draft.key)) subcategoryMap.set(draft.key, draft);
      }
      const subcategories = Array.from(subcategoryMap.values()).sort((a, b) =>
        localizedSubcategoryTitle(a).localeCompare(localizedSubcategoryTitle(b))
      );
      return {
        cat: category,
        items: visibleItems,
        allItems,
        subcategories,
      };
    });
  }, [categories, draftSubcategories, items, showDisabled, preferGreek]);

  const subcategoryOptions = useMemo(() => {
    const byCategory = new Map<string, SubcategorySummary[]>();
    for (const group of taxonomyGroups) {
      byCategory.set(group.cat.id, group.subcategories);
    }
    return byCategory;
  }, [taxonomyGroups]);
  const selectedSubcategoryOptions = subcategoryOptions.get(form.categoryId) ?? [];
  const selectedSubcategoryKey =
    form.subcategoryEn.trim() || form.subcategoryEl.trim()
      ? subcategoryKey(form.categoryId, form.subcategoryEn, form.subcategoryEl)
      : '';
  const selectedCategoryTitle = localizedCategoryTitle(categories.find((category) => category.id === form.categoryId));

  const groupItemsBySubcategory = (categoryId: string, categoryItems: ManagerItemSummary[]) => {
    const groups = new Map<string, { key: string; label: string; items: ManagerItemSummary[] }>();
    const uncategorizedLabel = t('manager.uncategorized', { defaultValue: 'Uncategorized' });
    for (const item of categoryItems) {
      const titleEn = (item.subcategoryEn || item.subcategory || '').trim();
      const titleEl = (item.subcategoryEl || item.subcategory || '').trim();
      const key = titleEn || titleEl ? subcategoryKey(categoryId, titleEn, titleEl) : `${categoryId}|__none__`;
      const label = titleEn || titleEl ? localizedSubcategoryTitle({ titleEn, titleEl }) : uncategorizedLabel;
      const group = groups.get(key) ?? { key, label, items: [] };
      group.items.push(item);
      groups.set(key, group);
    }
    return Array.from(groups.values()).sort((a, b) => {
      if (a.label === uncategorizedLabel) return 1;
      if (b.label === uncategorizedLabel) return -1;
      return a.label.localeCompare(b.label);
    });
  };

  const openSubcategoryCreate = (categoryId: string) => {
    setSubcategoryDialogMode('create');
    setEditingSubcategory(null);
    setSubcategoryForm({ categoryId, titleEn: '', titleEl: '' });
    setSubcategoryDialogOpen(true);
  };

  const openSubcategoryEdit = (subcategory: SubcategorySummary) => {
    setSubcategoryDialogMode('edit');
    setEditingSubcategory(subcategory);
    setSubcategoryForm({
      categoryId: subcategory.categoryId,
      titleEn: subcategory.titleEn,
      titleEl: subcategory.titleEl,
    });
    setSubcategoryDialogOpen(true);
  };

  const saveSubcategoryEdit = async () => {
    const categoryId = subcategoryForm.categoryId;
    const titleEn = subcategoryForm.titleEn.trim();
    const titleEl = subcategoryForm.titleEl.trim() || titleEn;
    if (!categoryId || !titleEn || !titleEl) {
      toast({ title: 'Title required', description: 'Both English and Greek subcategory names are required.' });
      return;
    }
    setSavingSubcategory(true);
    try {
      const key = subcategoryKey(categoryId, titleEn, titleEl);
      if (subcategoryDialogMode === 'create') {
        const draft: SubcategorySummary = {
          key,
          categoryId,
          titleEn,
          titleEl,
          itemCount: 0,
          items: [],
        };
        setDraftSubcategories((prev) => [
          ...prev.filter((item) => item.key !== key),
          draft,
        ]);
        setSubcategoryDialogOpen(false);
        openAdd(categoryId);
        setForm((prev) => ({ ...prev, categoryId, subcategoryEn: titleEn, subcategoryEl: titleEl }));
        toast({
          title: 'Subcategory ready',
          description: 'Save an item under it to persist it.',
        });
        return;
      }

      if (editingSubcategory) {
        if (editingSubcategory.itemCount === 0) {
          setDraftSubcategories((prev) =>
            prev.map((draft) =>
              draft.key === editingSubcategory.key
                ? { ...draft, key, titleEn, titleEl }
                : draft
            )
          );
        } else {
          await Promise.all(
            editingSubcategory.items.map((item) =>
              api.updateItem(item.id, {
                subcategoryEn: titleEn,
                subcategoryEl: titleEl,
              })
            )
          );
        }
        await load();
        setSubcategoryDialogOpen(false);
        setEditingSubcategory(null);
        toast({ title: 'Subcategory updated', description: titleEn });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update subcategory';
      toast({ title: 'Update failed', description: message });
    } finally {
      setSavingSubcategory(false);
    }
  };

  const deleteSubcategory = async (subcategory: SubcategorySummary) => {
    if (subcategory.itemCount === 0) {
      setDraftSubcategories((prev) => prev.filter((draft) => draft.key !== subcategory.key));
      return;
    }
    const yes = window.confirm('Remove this subcategory from all items in it?');
    if (!yes) return;
    setLoadingIds((prev) => new Set(prev).add(`sub:${subcategory.key}`));
    try {
      await Promise.all(
        subcategory.items.map((item) =>
          api.updateItem(item.id, {
            subcategoryEn: null,
            subcategoryEl: null,
          })
        )
      );
      await load();
      toast({ title: 'Subcategory removed', description: localizedSubcategoryTitle(subcategory) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not remove subcategory';
      toast({ title: 'Delete failed', description: message });
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(`sub:${subcategory.key}`);
        return next;
      });
    }
  };

  const organizeDrinksCategory = async () => {
    const drinkCategories = categories
      .map((category) => ({
        category,
        kind: resolveDrinkCategoryKind([category.titleEn, category.titleEl, category.title]),
      }))
      .filter((entry): entry is { category: MenuCategory; kind: DrinkCategoryKind } => Boolean(entry.kind));
    if (drinkCategories.length === 0) {
      toast({ title: 'No drink categories found', description: 'Create a Drinks category first.' });
      return;
    }
    setLoadingIds((prev) => new Set(prev).add('taxonomy:drinks'));
    try {
      const existingDrinks = drinkCategories.find((entry) => entry.kind === 'drinks')?.category;
      const drinksCategory =
        existingDrinks ??
        (
          await api.createCategory('Drinks', 'Ποτά', 20)
        ).category;
      const categoryKindById = new Map(drinkCategories.map((entry) => [entry.category.id, entry.kind]));
      const updates = items
        .map((item) => {
          const kind = item.categoryId ? categoryKindById.get(item.categoryId) : null;
          if (!kind) return null;
          const labels = drinkSubcategoryLabels[kind];
          return api.updateItem(item.id, {
            categoryId: drinksCategory.id,
            subcategoryEn: labels.en,
            subcategoryEl: labels.el,
          });
        })
        .filter(Boolean);
      await Promise.all(updates);
      await load();
      toast({ title: 'Drinks organized', description: 'Coffees, beers and drinks now sit under Drinks.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not organize drinks';
      toast({ title: 'Update failed', description: message });
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete('taxonomy:drinks');
        return next;
      });
    }
  };

  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">
          {t("manager.manage_menu_items", {
            defaultValue: "Manage Menu Items",
          })}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="gap-2 w-full sm:w-auto" onClick={openCategoryCreate}>
            <Plus className="h-4 w-4" />{" "}
            {t("manager.add_category", { defaultValue: "Add Category" })}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPanelOpen((prev) => !prev)}
            aria-label={panelOpen ? 'Collapse menu management' : 'Expand menu management'}
          >
            {panelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      {panelOpen && (
        <>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showDisabled} onChange={(e)=>setShowDisabled(e.target.checked)} />
          {t("manager.show_disabled_items", {
            defaultValue: "Show disabled items",
          })}
        </label>
      </div>

      <div className="space-y-8">
        {taxonomyGroups.map(({cat, items, allItems, subcategories}) => (
          <section key={cat.id}>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-foreground">{localizedCategoryTitle(cat)}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {allItems.length} {t("manager.items_count_short", { defaultValue: "items" })}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  EN: {cat.titleEn || cat.title || '-'} · EL: {cat.titleEl || cat.title || '-'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button size="sm" variant="outline" className="gap-1 w-full sm:w-auto" onClick={()=> openAdd(cat.id)}><Plus className="h-4 w-4"/>{t("manager.item", { defaultValue: "Item" })}</Button>
                <Button size="sm" variant="outline" className="gap-1 w-full sm:w-auto" onClick={()=> openSubcategoryCreate(cat.id)}>
                  <Plus className="h-4 w-4"/>{t("manager.subcategory", { defaultValue: "Subcategory" })}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => openCategoryEdit(cat)}><Pencil className="h-4 w-4"/></Button>
                <Button size="sm" variant="ghost" onClick={async ()=>{
                  const yes = window.confirm('Delete this category? Items will remain but may appear uncategorized.');
                  if (!yes) return;
                  try {
                    await api.deleteCategory(cat.id);
                    await load();
                    toast({ title: 'Category deleted', description: cat.title });
                  } catch (error) {
                    const message = error instanceof Error ? error.message : 'Could not delete category';
                    toast({ title: 'Delete failed', description: message });
                  }
                }}><Trash2 className="h-4 w-4"/></Button>
              </div>
            </div>
            <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {subcategories.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                  {t("manager.no_subcategories", { defaultValue: "No subcategories yet." })}
                </div>
              ) : subcategories.map((subcategory) => (
                <div key={subcategory.key} className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-card/40 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {localizedSubcategoryTitle(subcategory)}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      EN: {subcategory.titleEn || '-'} · EL: {subcategory.titleEl || '-'} · {subcategory.itemCount}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openSubcategoryEdit(subcategory)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => deleteSubcategory(subcategory)}
                      disabled={loadingIds.has(`sub:${subcategory.key}`)}
                    >
                      {loadingIds.has(`sub:${subcategory.key}`) ? (
                        <span className="h-3.5 w-3.5 border-2 border-current/60 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {items.length === 0 ? (
                <div className="text-xs text-muted-foreground">
                  {t("manager.no_items_in_category", {
                    defaultValue: "No items in this category.",
                  })}
                </div>
              ) : groupItemsBySubcategory(cat.id, items).map((group) => (
                <div key={group.key} className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary/80">{group.label}</div>
                  {group.items.map((item)=> (
                <div key={item.id} className={`flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between ${item.isAvailable === false ? 'opacity-60' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {item.titleEn || item.titleEl || item.title || item.name}
                      <span className="text-xs text-muted-foreground">
                        €{((item.priceCents ?? 0) / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{item.descriptionEn || item.descriptionEl || item.description || '—'}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (!item.id) return;
                        setLoadingIds((prev) => new Set(prev).add(`toggle:${item.id}`));
                        try {
                          await api.updateItem(item.id, { isAvailable: !item.isAvailable });
                          await load();
                          toast({
                            title: item.isAvailable ? 'Disabled' : 'Enabled',
                            description: item.title ?? item.name ?? '',
                          });
                        } catch (error) {
                          const message = error instanceof Error ? error.message : 'Could not update item';
                          toast({ title: 'Update failed', description: message });
                        } finally {
                          setLoadingIds((prev) => {
                            const next = new Set(prev);
                            next.delete(`toggle:${item.id}`);
                            return next;
                          });
                        }
                      }}
                      disabled={item.id ? loadingIds.has(`toggle:${item.id}`) : false}
                    >
                      {item.id && loadingIds.has(`toggle:${item.id}`) && (
                        <span className="h-4 w-4 mr-1 border-2 border-current/60 border-t-transparent rounded-full animate-spin" />
                      )}
                      {item.isAvailable
                        ? t("manager.disable", { defaultValue: "Disable" })
                        : t("manager.enable", { defaultValue: "Enable" })}
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => openEdit(item)}>
                      <Pencil className="h-4 w-4" /> Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-1"
                      onClick={async () => {
                        if (!item.id) return;
                        setLoadingIds((prev) => new Set(prev).add(`del:${item.id}`));
                        try {
                          await api.deleteItem(item.id);
                          await load();
                          toast({ title: 'Item deleted', description: item.title ?? item.name ?? '' });
                        } catch (error) {
                          const message =
                            error instanceof Error ? error.message : 'Cannot delete item (it may be referenced by orders)';
                          const referential =
                            message.toLowerCase().includes('referenced') ||
                            (typeof (error as { status?: number }).status === 'number' &&
                              (error as { status?: number }).status === 400);
                          if (referential) {
                            const confirmArchive =
                              window.confirm('This item has prior orders and cannot be deleted. Disable it instead?');
                            if (confirmArchive) {
                              try {
                                await api.updateItem(item.id, { isAvailable: false });
                                await load();
                                toast({ title: 'Item archived', description: item.title ?? item.name ?? '' });
                              } catch (archiveErr) {
                                const archiveMessage =
                                  archiveErr instanceof Error ? archiveErr.message : 'Could not disable item';
                                toast({ title: 'Archive failed', description: archiveMessage });
                              }
                            }
                          } else {
                            toast({ title: 'Delete failed', description: message });
                          }
                        } finally {
                          setLoadingIds((prev) => {
                            const next = new Set(prev);
                            next.delete(`del:${item.id}`);
                            return next;
                          });
                        }
                      }}
                      disabled={item.id ? loadingIds.has(`del:${item.id}`) : false}
                    >
                      {item.id && loadingIds.has(`del:${item.id}`) && (
                        <span className="h-4 w-4 mr-1 border-2 border-current/60 border-t-transparent rounded-full animate-spin" />
                      )}
                      <Trash2 className="h-4 w-4" /> {t("actions.delete")}
                    </Button>
                  </div>
                </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
        </>
      )}

      {/* Edit Category */}
      <Dialog
        open={categoryDialogOpen}
        onOpenChange={(open) => {
          setCategoryDialogOpen(open);
          if (!open) {
            setEditingCategory(null);
            setCategoryForm({ titleEn: '', titleEl: '', sortOrder: '0', imageUrl: '' });
            setCategoryDialogMode('edit');
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {categoryDialogMode === 'create'
                ? t("manager.add_category", { defaultValue: "Add Category" })
                : t("manager.edit_category", { defaultValue: "Edit Category" })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {editingCategory ? (
              <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                {taxonomyGroups.find((group) => group.cat.id === editingCategory.id)?.allItems.length ?? 0}{' '}
                {t("manager.items_in_category", { defaultValue: "items in this category" })}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium">Name (EN)</span>
                <Input
                  placeholder="Drinks"
                  value={categoryForm.titleEn}
                  onChange={(e) => setCategoryForm((prev) => ({ ...prev, titleEn: e.target.value }))}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">Name (EL)</span>
                <Input
                  placeholder="Ποτά"
                  value={categoryForm.titleEl}
                  onChange={(e) => setCategoryForm((prev) => ({ ...prev, titleEl: e.target.value }))}
                />
              </label>
            </div>
            <label className="space-y-2">
              <span className="text-sm font-medium">Sort order</span>
              <Input
                type="number"
                step={1}
                value={categoryForm.sortOrder}
                onChange={(e) => setCategoryForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
              />
            </label>
            <div className="space-y-3">
              <div>
                <span className="text-sm font-medium">First menu page image</span>
                <p className="text-xs text-muted-foreground">
                  This image appears on the category tile before guests enter the menu.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {categoryImagePool.map((image) => {
                  const selected = categoryForm.imageUrl === image.url;
                  return (
                    <button
                      key={image.url}
                      type="button"
                      onClick={() => setCategoryForm((prev) => ({ ...prev, imageUrl: image.url }))}
                      className={`overflow-hidden rounded-lg border text-left transition ${
                        selected ? 'border-primary ring-2 ring-primary/30' : 'border-border/70 hover:border-primary/50'
                      }`}
                    >
                      <img src={image.url} alt="" className="h-20 w-full object-cover" />
                      <span className="block px-2 py-1.5 text-xs font-medium">{image.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-2">
                <span className="text-sm font-medium">Custom image URL</span>
                <Input
                  placeholder="https://..."
                  value={categoryForm.imageUrl}
                  onChange={(e) => setCategoryForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
                />
              </div>
              {categoryForm.imageUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="px-0"
                  onClick={() => setCategoryForm((prev) => ({ ...prev, imageUrl: '' }))}
                >
                  Clear image
                </Button>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setCategoryDialogOpen(false); setEditingCategory(null); }}>
              {t("actions.cancel")}
            </Button>
            <Button onClick={saveCategoryEdit} disabled={savingCategory}>
              {savingCategory && (
                <span className="h-4 w-4 mr-2 border-2 border-current/60 border-t-transparent rounded-full animate-spin" />
              )}
              {categoryDialogMode === 'create'
                ? t("manager.create", { defaultValue: "Create" })
                : t("actions.save_changes", { defaultValue: "Save" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Subcategory */}
      <Dialog
        open={subcategoryDialogOpen}
        onOpenChange={(open) => {
          setSubcategoryDialogOpen(open);
          if (!open) {
            setEditingSubcategory(null);
            setSubcategoryForm({ categoryId: '', titleEn: '', titleEl: '' });
            setSubcategoryDialogMode('edit');
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {subcategoryDialogMode === 'create'
                ? t("manager.add_subcategory", { defaultValue: "Add subcategory" })
                : t("manager.edit_subcategory", { defaultValue: "Edit subcategory" })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <label className="space-y-2">
              <span className="text-sm font-medium">{t("manager.category", { defaultValue: "Category" })}</span>
              <select
                className="h-11 w-full rounded-md border border-border bg-card px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                value={subcategoryForm.categoryId}
                onChange={(e) => setSubcategoryForm((prev) => ({ ...prev, categoryId: e.target.value }))}
                disabled={subcategoryDialogMode === 'edit'}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {localizedCategoryTitle(category)}
                  </option>
                ))}
              </select>
            </label>
            {editingSubcategory ? (
              <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                {editingSubcategory.itemCount} {t("manager.items_in_subcategory", { defaultValue: "items in this subcategory" })}
              </div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium">Name (EN)</span>
                <Input
                  placeholder="Coffees"
                  value={subcategoryForm.titleEn}
                  onChange={(e) => setSubcategoryForm((prev) => ({ ...prev, titleEn: e.target.value }))}
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium">Name (EL)</span>
                <Input
                  placeholder="Καφέδες"
                  value={subcategoryForm.titleEl}
                  onChange={(e) => setSubcategoryForm((prev) => ({ ...prev, titleEl: e.target.value }))}
                />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSubcategoryDialogOpen(false)}>
              {t("actions.cancel")}
            </Button>
            <Button onClick={saveSubcategoryEdit} disabled={savingSubcategory}>
              {savingSubcategory && (
                <span className="h-4 w-4 mr-2 border-2 border-current/60 border-t-transparent rounded-full animate-spin" />
              )}
              {subcategoryDialogMode === 'create'
                ? t("manager.create", { defaultValue: "Create" })
                : t("actions.save_changes", { defaultValue: "Save" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Item */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-3xl lg:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t("manager.edit_item", { defaultValue: "Edit item" })
                : t("manager.add_item", { defaultValue: "Add item" })}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
            <section className="rounded-lg border border-border/70 bg-card/30 p-4">
              <div className="mb-4">
                <h3 className="text-base font-semibold">
                  {t("manager.item_details", {
                    defaultValue: "Item details",
                  })}
                </h3>
                <p className="text-sm text-muted-foreground">Name, category, description and pricing.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium">Name (EN)</span>
                  <Input placeholder="Pita Pork" value={form.titleEn} onChange={(e)=>setForm({...form, titleEn: e.target.value})}/>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Name (EL)</span>
                  <Input placeholder="Pita Pork" value={form.titleEl} onChange={(e)=>setForm({...form, titleEl: e.target.value})}/>
                </label>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium">Category</span>
                  <select
                    className="h-11 w-full rounded-md border border-border bg-card px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    value={form.categoryId}
                    onChange={(e)=>setForm({...form, categoryId: e.target.value, subcategoryEn: '', subcategoryEl: ''})}
                  >
                    {categories.map((category)=>(
                      <option key={category.id} value={category.id}>
                        {localizedCategoryTitle(category)}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {selectedCategoryTitle || t("manager.no_category_selected", { defaultValue: "No category selected" })}
                  </p>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Price</span>
                  <Input placeholder="3.50" type="number" min={0} step={0.01} value={form.price} onChange={(e)=>setForm({...form, price: e.target.value})}/>
                </label>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium">Subcategory</span>
                  <select
                    className="h-11 w-full rounded-md border border-border bg-card px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
                    value={selectedSubcategoryKey}
                    onChange={(e) => {
                      const option = selectedSubcategoryOptions.find((candidate) => candidate.key === e.target.value);
                      if (!option) {
                        setForm({ ...form, subcategoryEn: '', subcategoryEl: '' });
                        return;
                      }
                      setForm({ ...form, subcategoryEn: option.titleEn, subcategoryEl: option.titleEl });
                    }}
                  >
                    <option value="">
                      {t("manager.no_subcategory", { defaultValue: "No subcategory" })}
                    </option>
                    {selectedSubcategoryOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {localizedSubcategoryTitle(option)}
                      </option>
                    ))}
                  </select>
                  {selectedSubcategoryOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("manager.create_subcategory_first", { defaultValue: "Create subcategories from the category editor first." })}
                    </p>
                  ) : null}
                </label>
                <div className="flex min-h-11 items-center rounded-md border border-border bg-muted/25 px-3 text-sm text-muted-foreground">
                  {form.subcategoryEn || form.subcategoryEl
                    ? `${form.subcategoryEn || '-'} / ${form.subcategoryEl || '-'}`
                    : t("manager.no_subcategory_selected", { defaultValue: "No subcategory selected" })}
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium">Description (EN)</span>
                  <Textarea className="min-h-28 resize-y" placeholder="Short menu description" value={form.descriptionEn} onChange={(e)=>setForm({...form, descriptionEn: e.target.value})}/>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-medium">Description (EL)</span>
                  <Textarea className="min-h-28 resize-y" placeholder="Short menu description" value={form.descriptionEl} onChange={(e)=>setForm({...form, descriptionEl: e.target.value})}/>
                </label>
              </div>
            </section>
            <section className="rounded-lg border border-border/70 bg-card/30 p-4">
              <div className="mb-4">
                <h3 className="text-base font-semibold">
                  {t("manager.image", { defaultValue: "Image" })}
                </h3>
                <p className="text-sm text-muted-foreground">Paste an image URL or upload a replacement.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-[1fr_160px]">
                <div className="space-y-4">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium">Image URL</span>
                    <Input
                      placeholder="https://..."
                      value={form.imageUrl}
                      onChange={(e)=>{
                        const imageUrl = e.target.value;
                        setForm({ ...form, imageUrl });
                        if (!imageFile) setImagePreview(imageUrl);
                      }}
                    />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                      <ImagePlus className="h-4 w-4" />
                      {t("manager.upload_image", {
                        defaultValue: "Upload image",
                      })}
                      <input
                        className="sr-only"
                        type="file"
                        accept="image/*"
                        onChange={(e)=>{
                          selectImageFile(e.target.files?.[0] || null);
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                    {imageFile ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => selectImageFile(null)}
                        aria-label="Remove selected image"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                  {imageFile ? <p className="text-xs text-muted-foreground">{imageFile.name}</p> : null}
                  {imageUploadStatus ? (
                    <p className="text-xs font-medium text-primary">{imageUploadStatus}</p>
                  ) : null}
                </div>
                <div
                  className="flex h-40 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/20"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    selectImageFile(event.dataTransfer.files?.[0] || null);
                  }}
                >
                  {imagePreview ? (
                    <img src={imagePreview} alt="Item preview" className="h-full w-full object-cover" />
                  ) : (
                    <span className="px-4 text-center text-sm text-muted-foreground">
                      {t("manager.no_image_preview", {
                        defaultValue: "No image preview",
                      })}
                    </span>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-border/70 bg-card/30 p-4">
              <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                <label className="space-y-2">
                  <span className="text-sm font-medium">Cook type</span>
                  <select
                    className="h-11 w-full rounded-md border border-border bg-card px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    value={form.printerTopic}
                    onChange={(e)=>setForm({...form, printerTopic: normalizePrinterTopicValue(e.target.value)})}
                  >
                    {displayCookTypeOptions.length === 0 ? (
                      <option value="">
                        {t("manager.no_cook_types_configured", {
                          defaultValue: "No cook types configured",
                        })}
                      </option>
                    ) : null}
                    {displayCookTypeOptions.map((opt) => (
                      <option key={opt.id} value={opt.printerTopic}>
                        {opt.id === 'legacy-printer'
                          ? opt.title
                          : `${opt.title} (${opt.printerTopic})`}
                      </option>
                    ))}
                  </select>
                  {displayCookTypeOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("manager.add_cook_types_first", {
                        defaultValue: "Add cook types with printer topics first.",
                      })}
                    </p>
                  ) : null}
                </label>
                <label className="flex h-11 items-center gap-3 rounded-md border border-border bg-card px-4 text-sm font-medium">
                  <input type="checkbox" checked={form.isAvailable} onChange={(e)=>setForm({...form, isAvailable: e.target.checked})}/>
                  {t("manager.available", { defaultValue: "Available" })}
                </label>
              </div>
            </section>

            <section className="rounded-lg border border-border/70 bg-card/30 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">Modifiers</h3>
                  <p className="text-sm text-muted-foreground">Extras, choices and add-ons shown to guests.</p>
                </div>
                <Button size="sm" variant="outline" onClick={()=> setCustomMods(mods=>[...mods, { titleEn:'', titleEl:'', required:false, selectionMode:'single', isAvailable:true, options:[] }])}>
                  <Plus className="mr-2 h-4 w-4" />{" "}
                  {t("manager.add_modifier", {
                    defaultValue: "Add modifier",
                  })}
                </Button>
              </div>
              <div className="space-y-4">
                {customMods.map((cm, idx) => (
                  <div key={idx} className="rounded-md border border-border bg-background/40 p-4">
                    <div className="mb-3 grid gap-3 md:grid-cols-2">
                      <Input placeholder="Modifier title (EN)" value={cm.titleEn} onChange={(e)=>{
                        const v=e.target.value; setCustomMods(mods=>mods.map((m,i)=> i===idx? { ...m, titleEn: v}: m));
                      }}/>
                      <Input placeholder="Modifier title (EL)" value={cm.titleEl} onChange={(e)=>{
                        const v=e.target.value; setCustomMods(mods=>mods.map((m,i)=> i===idx? { ...m, titleEl: v}: m));
                      }}/>
                    </div>
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      <div className="flex rounded-md border border-border bg-card p-1 text-sm">
                        <button
                          type="button"
                          onClick={() => setCustomMods(mods=>mods.map((m,i)=> i===idx? { ...m, selectionMode: 'single' }: m))}
                          className={`rounded px-3 py-1.5 transition-colors ${cm.selectionMode === 'single' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          At most 1
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomMods(mods=>mods.map((m,i)=> i===idx? { ...m, selectionMode: 'multiple' }: m))}
                          className={`rounded px-3 py-1.5 transition-colors ${cm.selectionMode === 'multiple' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          Zero, 1 or many
                        </button>
                      </div>
                      <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                        <input type="checkbox" checked={cm.required} onChange={(e)=>{
                          const v=e.target.checked; setCustomMods(mods=>mods.map((m,i)=> i===idx? { ...m, required: v}: m));
                        }}/>
                        Required
                      </label>
                      <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                        <input type="checkbox" checked={cm.isAvailable} onChange={(e)=>{
                          const v=e.target.checked; setCustomMods(mods=>mods.map((m,i)=> i===idx? { ...m, isAvailable: v}: m));
                        }}/>
                        {t("manager.available", { defaultValue: "Available" })}
                      </label>
                      <Button variant="ghost" size="sm" onClick={()=> setCustomMods(mods=>mods.filter((_,i)=> i!==idx))}>
                        <Trash2 className="h-4 w-4 mr-1" />{" "}
                        {t("manager.remove", { defaultValue: "Remove" })}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {cm.options.map((opt, oi) => (
                        <div key={oi} className="grid gap-2 md:grid-cols-[1fr_1fr_140px]">
                          <Input placeholder="Option label EN (e.g., Oat)" value={opt.titleEn} onChange={(e)=>{
                            const v=e.target.value; setCustomMods(mods=>mods.map((m,i)=> i===idx? { ...m, options: m.options.map((o,j)=> j===oi? { ...o, titleEn: v}: o)}: m));
                          }}/>
                          <Input placeholder="Option label EL" value={opt.titleEl} onChange={(e)=>{
                            const v=e.target.value; setCustomMods(mods=>mods.map((m,i)=> i===idx? { ...m, options: m.options.map((o,j)=> j===oi? { ...o, titleEl: v}: o)}: m));
                          }}/>
                          <Input placeholder="Price +€ (e.g., 0.50)" type="number" min={0} step={0.01} value={opt.price} onChange={(e)=>{
                            const v=e.target.value; setCustomMods(mods=>mods.map((m,i)=> i===idx? { ...m, options: m.options.map((o,j)=> j===oi? { ...o, price: v}: o)}: m));
                          }}/>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" onClick={()=> setCustomMods(mods=>mods.map((m,i)=> i===idx? { ...m, options: [...m.options, { titleEn:'', titleEl:'', price:''}] }: m))}>
                        <Plus className="mr-2 h-4 w-4" />{" "}
                        {t("manager.add_option", {
                          defaultValue: "Add option",
                        })}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={()=>setModalOpen(false)}>
              {t("actions.cancel")}
            </Button>
            {(() => {
              const priceNum = parseFloat(form.price || '');
              const modifierMissingTitle = customMods.some((cm) => cm.options.length > 0 && (!cm.titleEn.trim() || !cm.titleEl.trim()));
              const modifierMissingOptionLabel = customMods.some((cm) =>
                cm.options.some((opt) => !opt.titleEn.trim() || !opt.titleEl.trim())
              );
              const hasModifierValidationError = modifierMissingTitle || modifierMissingOptionLabel;
              const printerSelected = form.printerTopic.trim().length > 0;
              const canSave = form.titleEn.trim().length > 0 && form.titleEl.trim().length > 0 && Number.isFinite(priceNum) && printerSelected && !hasModifierValidationError;
              return (
                <Button
                  onClick={async ()=>{
                    if (!canSave) return;
                    setSavingItem(true);
                    try {
                      const categoryId = form.categoryId;
                      if (!categoryId) return;
                      const payload: ManagerItemPayload = {
                        titleEn: form.titleEn.trim(),
                        titleEl: form.titleEl.trim(),
                        subcategoryEn: form.subcategoryEn.trim() || null,
                        subcategoryEl: form.subcategoryEl.trim() || null,
                        descriptionEn: form.descriptionEn,
                        descriptionEl: form.descriptionEl,
                        priceCents: Math.round((parseFloat(form.price || '0') || 0) * 100),
                        categoryId,
                        isAvailable: form.isAvailable,
                        imageUrl: form.imageUrl.trim() || undefined,
                        printerTopic: form.printerTopic.trim() || null,
                      };
                      const typedImageUrl = imageFile ? '' : form.imageUrl.trim();

                      let itemId = editing?.id;
                      let finalImageUrl: string | null = typedImageUrl.length > 0 ? typedImageUrl : null;
                      const uploadSelectedImage = async (id: string) => {
                        setImageUploadStatus('Optimizing image...');
                        console.info('[manager:image-upload] preparing selected image', {
                          itemId: id,
                          fileName: imageFile?.name,
                          fileSize: imageFile?.size,
                          storeSlug,
                        });
                        const res = await api.managerUploadImage(imageFile!, { itemId: id, storeSlug });
                        const freshUrl = withFreshImageVersion(res.publicUrl);
                        setImageUploadStatus('Image uploaded');
                        console.info('[manager:image-upload] uploaded selected image', {
                          itemId: id,
                          path: res.path,
                          publicUrl: freshUrl,
                        });
                        return freshUrl;
                      };

                      if (editing) {
                        if (imageFile) {
                          try {
                            finalImageUrl = await uploadSelectedImage(editing.id);
                          } catch (error) {
                            const message = error instanceof Error ? error.message : 'Could not upload image';
                            setImageUploadStatus('Upload failed');
                            toast({ title: 'Upload failed', description: message });
                            return;
                          }
                        }
                        await api.updateItem(editing.id, {
                          ...payload,
                          imageUrl: finalImageUrl ?? undefined,
                        });
                        itemId = editing.id;
                      } else {
                        const created = await api.createItem({
                          ...payload,
                          imageUrl: finalImageUrl ?? undefined,
                        });
                        itemId = created.item?.id;
                        if (itemId && (imageFile || finalImageUrl)) {
                          try {
                            if (imageFile) {
                              finalImageUrl = await uploadSelectedImage(itemId);
                            }
                            if (finalImageUrl) {
                              await api.updateItem(itemId, { imageUrl: finalImageUrl });
                            }
                          } catch (error) {
                            const message = error instanceof Error ? error.message : 'Could not upload image';
                            setImageUploadStatus('Upload failed');
                            toast({ title: 'Upload failed', description: message });
                            return;
                          }
                        }
                      }
                      if (itemId) {
                        const seenModifiers = new Set<string>();
                        for (const cm of customMods) {
                          if (!cm.titleEn.trim() && !cm.titleEl.trim()) continue;
                          const maxSelect = cm.selectionMode === 'single' ? 1 : Math.max(1, cm.options.length);
                          let modifierId = cm.id;
                          if (modifierId) {
                            await api.updateModifier(modifierId, {
                              titleEn: cm.titleEn.trim(),
                              titleEl: cm.titleEl.trim(),
                              minSelect: cm.required ? 1 : 0,
                              maxSelect,
                              isAvailable: cm.isAvailable,
                            });
                          } else {
                            const createdModifier = await api.createModifier({
                              titleEn: cm.titleEn.trim(),
                              titleEl: cm.titleEl.trim(),
                              minSelect: cm.required ? 1 : 0,
                              maxSelect,
                              isAvailable: cm.isAvailable,
                            });
                            modifierId = createdModifier.modifier.id;
                          }
                          if (!modifierId) continue;
                          seenModifiers.add(modifierId);
                          let index = 0;
                          const keep = new Set<string>();
                          for (const opt of cm.options) {
                            if (!opt.titleEn.trim() && !opt.titleEl.trim()) continue;
                            const priceCents = Math.round((parseFloat(opt.price || '0') || 0) * 100);
                            if (opt.id) {
                              keep.add(opt.id);
                              await api.updateModifierOption(opt.id, {
                                titleEn: opt.titleEn.trim(),
                                titleEl: opt.titleEl.trim(),
                                priceDeltaCents: priceCents,
                                sortOrder: index++,
                              });
                            } else {
                              const createdOpt = await api.createModifierOption({
                                modifierId,
                                titleEn: opt.titleEn.trim(),
                                titleEl: opt.titleEl.trim(),
                                priceDeltaCents: priceCents,
                                sortOrder: index++,
                              });
                              keep.add(createdOpt.option.id);
                            }
                          }
                          (cm.originalOptionIds || []).forEach(async (oid) => {
                            if (!keep.has(oid)) {
                              try {
                                await api.deleteModifierOption(oid);
                              } catch (error) {
                                console.warn('Failed to delete option', error);
                              }
                            }
                          });
                          await api.linkItemModifier(itemId, modifierId, cm.required);
                        }
                        originalModifierIds.forEach(async (mid) => {
                          if (!seenModifiers.has(mid)) {
                            await api.unlinkItemModifier(itemId!, mid);
                          }
                        });
                      }
                      await load();
                      setImageFile(null);
                      setImageUploadStatus('');
                      setModalOpen(false);
                    } finally {
                      setSavingItem(false);
                    }
                  }}
                  disabled={savingItem || !canSave}
                  className="inline-flex items-center gap-2"
                >
              {savingItem && <span className="h-4 w-4 border-2 border-current/60 border-t-transparent rounded-full animate-spin"/>}
                  {t("actions.save_changes")}
                </Button>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
