import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';
import type { ManagerItemSummary, ManagerItemPayload, MenuCategory, Modifier, ModifierOption } from '@/types';
import { useToast } from '@/hooks/use-toast';

type CustomOption = { id?: string; titleEn: string; titleEl: string; price: string };
type CustomModifier = { id?: string; titleEn: string; titleEl: string; required: boolean; isAvailable: boolean; options: CustomOption[]; originalOptionIds?: string[] };
type ItemForm = {
  titleEn: string;
  titleEl: string;
  descriptionEn: string;
  descriptionEl: string;
  imageUrl: string;
  price: string;
  categoryId: string;
  newCategoryTitle: string;
  isAvailable: boolean;
};

export const ManagerMenuPanel = () => {
  const { toast } = useToast();

  const [items, setItems] = useState<ManagerItemSummary[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);

  const [storeSlug, setStoreSlug] = useState<string>('');
  const [printerTopics, setPrinterTopics] = useState<string[]>([]);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ManagerItemSummary | null>(null);
  const [form, setForm] = useState<ItemForm>({
    titleEn: '',
    titleEl: '',
    descriptionEn: '',
    descriptionEl: '',
    imageUrl: '',
    price: '0.00',
    categoryId: '',
    newCategoryTitle: '',
    isAvailable: true,
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

  // Category edit modal
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState<{ title: string; printerChoice: string }>({
    title: '',
    printerChoice: '',
  });
  const [savingCategory, setSavingCategory] = useState(false);
  const [categoryDialogMode, setCategoryDialogMode] = useState<'create' | 'edit'>('edit');

  const getPrinterOptions = (selected?: string) => {
    if (!selected || printerTopics.includes(selected)) return printerTopics;
    return [selected, ...printerTopics];
  };

  const load = useCallback(async () => {
    try {
      const [itemsRes, categoriesRes, storeRes] = await Promise.all([
        api.listItems(),
        api.listCategories(),
        api.getStore(),
      ]);
      setItems(itemsRes.items ?? []);
      setCategories(
        (categoriesRes.categories ?? []).map((c) => ({
          ...c,
          title: c.title || c.titleEn || c.titleEl || '',
        }))
      );
      const rawPrinters =
        (storeRes as any)?.store?.settings?.printers ??
        (storeRes as any)?.store?.settingsJson?.printers ??
        (storeRes as any)?.store?.printers ??
        [];
      if (Array.isArray(rawPrinters)) {
        setPrinterTopics(
          Array.from(
            new Set(
              rawPrinters
                .map((printer) => (typeof printer === 'string' ? printer.trim() : ''))
                .filter(Boolean)
            )
          )
        );
      } else {
        setPrinterTopics([]);
      }
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

  const openCategoryCreate = () => {
    const fallbackPrinter = printerTopics[0] ?? '';
    setCategoryForm({ title: '', printerChoice: fallbackPrinter });
    setEditingCategory(null);
    setCategoryDialogMode('create');
    setCategoryDialogOpen(true);
  };

  const openCategoryEdit = (cat: MenuCategory) => {
    const printer = cat.printerTopic || '';
    const fallbackPrinter = printerTopics[0] ?? '';
    setCategoryForm({
      title: cat.title || '',
      printerChoice: printer || fallbackPrinter || '',
    });
    setEditingCategory(cat);
    setCategoryDialogMode('edit');
    setCategoryDialogOpen(true);
  };

  const saveCategoryEdit = async () => {
    const fallbackTitle = editingCategory?.title || '';
    const title = categoryForm.title.trim() || fallbackTitle;
    if (!title) {
      toast({ title: 'Title required', description: 'Category title cannot be empty' });
      return;
    }
    const effectivePrinter = (categoryForm.printerChoice || '').trim();
    setSavingCategory(true);
    try {
      if (categoryDialogMode === 'create') {
        await api.createCategory(title, title, undefined, effectivePrinter || null);
        toast({ title: 'Category added', description: title });
      } else if (editingCategory) {
        await api.updateCategory(editingCategory.id, {
          titleEn: title,
          titleEl: title,
          printerTopic: effectivePrinter || null,
        });
        toast({ title: 'Category updated', description: title });
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
      descriptionEn: '',
      descriptionEl: '',
      imageUrl: '',
      price: '0.00',
      categoryId: fallbackCategory,
      newCategoryTitle: '',
      isAvailable: true,
    });
    setCustomMods([]);
    setOriginalModifierIds(new Set());
    setModalOpen(true);
  };

  const openEdit = async (item: ManagerItemSummary) => {
    setEditing(item);
    setForm({
      titleEn: item.titleEn ?? item.title ?? item.name ?? '',
      titleEl: item.titleEl ?? item.title ?? item.name ?? '',
      descriptionEn: item.descriptionEn ?? item.description ?? '',
      descriptionEl: item.descriptionEl ?? item.description ?? '',
      // Prefer the backend URL so images load directly via /menu response.
      imageUrl: item.imageUrl ?? item.image ?? '',
      price: typeof item.priceCents === 'number' ? (item.priceCents / 100).toFixed(2) : '0.00',
      categoryId: item.categoryId ?? '',
      newCategoryTitle: '',
      isAvailable: item.isAvailable ?? true,
    });
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

  const grouped = categories.map((category) => ({
    cat: category,
    items: items
      .filter((item) => item.categoryId === category.id || item.category === category.title)
      .filter((item) => (showDisabled ? true : item.isAvailable !== false)),
  }));

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Manage Menu Items</h2>
        <div className="flex gap-2">
          <Button size="sm" className="gap-2" onClick={openCategoryCreate}>
            <Plus className="h-4 w-4" /> Add Category
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
      <div className="flex items-center gap-2 mb-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showDisabled} onChange={(e)=>setShowDisabled(e.target.checked)} />
          Show disabled items
        </label>
      </div>

      <div className="space-y-8">
        {grouped.map(({cat, items}) => (
          <section key={cat.id}>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-lg font-semibold text-foreground flex-1">{cat.title}</h3>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" className="gap-1" onClick={()=> openAdd(cat.id)}><Plus className="h-4 w-4"/> Item</Button>
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
            <div className="space-y-2">
              {items.length === 0 ? (
                <div className="text-xs text-muted-foreground">No items in this category.</div>
              ) : items.map((item)=> (
                <div key={item.id} className={`flex items-center justify-between border rounded-lg p-3 ${item.isAvailable === false ? 'opacity-60' : ''}`}>
                  <div>
                    <div className="font-medium">
                      {item.titleEn || item.titleEl || item.title || item.name}
                      <span className="text-xs text-muted-foreground">
                        €{((item.priceCents ?? 0) / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{item.descriptionEn || item.descriptionEl || item.description || '—'}</div>
                  </div>
                  <div className="flex gap-2">
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
                      {item.isAvailable ? 'Disable' : 'Enable'}
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
                      <Trash2 className="h-4 w-4" /> Delete
                    </Button>
                  </div>
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
            setCategoryForm({ title: '', printerChoice: '' });
            setCategoryDialogMode('edit');
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{categoryDialogMode === 'create' ? 'Add category' : 'Edit category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Category title"
              value={categoryForm.title}
              onChange={(e) => setCategoryForm((prev) => ({ ...prev, title: e.target.value }))}
            />
            <div className="space-y-2">
              <label className="text-sm font-medium">Printer topic</label>
              <select
                className="w-full border border-border rounded p-2 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                value={categoryForm.printerChoice}
                onChange={(e) => setCategoryForm((prev) => ({ ...prev, printerChoice: e.target.value }))}
              >
                <option value="">No printer</option>
                {getPrinterOptions(categoryForm.printerChoice).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              {printerTopics.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No printers configured in Architect settings.
                </p>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">Choose where this category prints.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setCategoryDialogOpen(false); setEditingCategory(null); }}>
              Cancel
            </Button>
            <Button onClick={saveCategoryEdit} disabled={savingCategory}>
              {savingCategory && (
                <span className="h-4 w-4 mr-2 border-2 border-current/60 border-t-transparent rounded-full animate-spin" />
              )}
              {categoryDialogMode === 'create' ? 'Create' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Item */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Item' : 'Add Item'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Title (EN)" value={form.titleEn} onChange={(e)=>setForm({...form, titleEn: e.target.value})}/>
              <Input placeholder="Title (EL)" value={form.titleEl} onChange={(e)=>setForm({...form, titleEl: e.target.value})}/>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Textarea placeholder="Description (EN)" value={form.descriptionEn} onChange={(e)=>setForm({...form, descriptionEn: e.target.value})}/>
              <Textarea placeholder="Description (EL)" value={form.descriptionEl} onChange={(e)=>setForm({...form, descriptionEl: e.target.value})}/>
            </div>
            <Input placeholder="Image URL (https://...)" value={form.imageUrl} onChange={(e)=>setForm({ ...form, imageUrl: e.target.value })} />
            <div className="text-xs text-muted-foreground">
              Or upload an image: <input type="file" accept="image/*" onChange={(e)=>{
                const f = e.target.files?.[0] || null;
                setImageFile(f);
                setImagePreview(f ? URL.createObjectURL(f) : form.imageUrl || '');
              }} />
              {imagePreview && (
                <div className="mt-2">
                  <img src={imagePreview} alt="preview" className="h-24 w-24 object-cover rounded border" />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 items-center">
            <Input placeholder="Price (€)" type="number" min={0} step={0.01} value={form.price} onChange={(e)=>setForm({...form, price: e.target.value})}/>
              {editing ? (
                <select
                  className="border border-border rounded p-2 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  value={form.categoryId}
                  onChange={(e)=>setForm({...form, categoryId: e.target.value})}
                >
                  {categories.map((category)=>(<option key={category.id} value={category.id}>{category.title}</option>))}
                </select>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Category: <span className="font-medium text-foreground">{categories.find((category)=>category.id===form.categoryId)?.title || '—'}</span>
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isAvailable} onChange={(e)=>setForm({...form, isAvailable: e.target.checked})}/>
              Available
            </label>

            {/* Modifiers builder */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">Modifiers</div>
                <Button size="sm" variant="outline" onClick={()=> setCustomMods(mods=>[...mods, { titleEn:'', titleEl:'', required:false, isAvailable:true, options:[] }])}>+ Add modifier</Button>
              </div>
              <div className="space-y-4">
                {customMods.map((cm, idx) => (
                  <div key={idx} className="border rounded p-3">
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <Input placeholder="Modifier title (EN)" value={cm.titleEn} onChange={(e)=>{
                        const v=e.target.value; setCustomMods(mods=>mods.map((m,i)=> i===idx? { ...m, titleEn: v}: m));
                      }}/>
                      <Input placeholder="Modifier title (EL)" value={cm.titleEl} onChange={(e)=>{
                        const v=e.target.value; setCustomMods(mods=>mods.map((m,i)=> i===idx? { ...m, titleEl: v}: m));
                      }}/>
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={cm.required} onChange={(e)=>{
                          const v=e.target.checked; setCustomMods(mods=>mods.map((m,i)=> i===idx? { ...m, required: v}: m));
                        }}/>
                        required
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={cm.isAvailable} onChange={(e)=>{
                          const v=e.target.checked; setCustomMods(mods=>mods.map((m,i)=> i===idx? { ...m, isAvailable: v}: m));
                        }}/>
                        Available
                      </label>
                      <Button variant="ghost" size="sm" onClick={()=> setCustomMods(mods=>mods.filter((_,i)=> i!==idx))}>
                        <Trash2 className="h-4 w-4 mr-1" /> Remove
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {cm.options.map((opt, oi) => (
                        <div key={oi} className="grid grid-cols-3 gap-2">
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
                      <Button size="sm" variant="outline" onClick={()=> setCustomMods(mods=>mods.map((m,i)=> i===idx? { ...m, options: [...m.options, { titleEn:'', titleEl:'', price:''}] }: m))}>+ Option</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={()=>setModalOpen(false)}>Cancel</Button>
            {(() => {
              const priceNum = parseFloat(form.price || '');
              const modifierMissingTitle = customMods.some((cm) => cm.options.length > 0 && (!cm.titleEn.trim() || !cm.titleEl.trim()));
              const modifierMissingOptionLabel = customMods.some((cm) =>
                cm.options.some((opt) => !opt.titleEn.trim() || !opt.titleEl.trim())
              );
              const hasModifierValidationError = modifierMissingTitle || modifierMissingOptionLabel;
              const canSave = form.titleEn.trim().length > 0 && form.titleEl.trim().length > 0 && Number.isFinite(priceNum) && !hasModifierValidationError;
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
                        descriptionEn: form.descriptionEn,
                        descriptionEl: form.descriptionEl,
                        priceCents: Math.round((parseFloat(form.price || '0') || 0) * 100),
                        categoryId,
                        isAvailable: form.isAvailable,
                        imageUrl: form.imageUrl.trim() || undefined,
                      };
                      const typedImageUrl = form.imageUrl.trim();

                      let itemId = editing?.id;
                      let finalImageUrl: string | null = typedImageUrl.length > 0 ? typedImageUrl : null;

                      if (editing) {
                        if (imageFile) {
                          try {
                            const safeName = `${Date.now()}-${imageFile.name.replace(/[^a-zA-Z0-9_.-]/g, '-')}`;
                            const res = await api.managerUploadImage(imageFile, { itemId: editing.id, storeSlug });
                            finalImageUrl = res.publicUrl;
                          } catch (error) {
                            const message = error instanceof Error ? error.message : 'Could not upload image';
                            toast({ title: 'Upload failed', description: message });
                          }
                        }
                        await api.updateItem(editing.id, { ...payload, imageUrl: finalImageUrl ?? undefined });
                        itemId = editing.id;
                      } else {
                        const created = await api.createItem(payload);
                        itemId = created.item?.id;
                        if (itemId && (imageFile || finalImageUrl)) {
                          try {
                            if (imageFile) {
                              const safeName = `${Date.now()}-${imageFile.name.replace(/[^a-zA-Z0-9_.-]/g, '-')}`;
                              const res2 = await api.managerUploadImage(imageFile, { itemId, storeSlug });
                              finalImageUrl = res2.publicUrl;
                            }
                            if (finalImageUrl) {
                              await api.updateItem(itemId, { imageUrl: finalImageUrl });
                            }
                          } catch (error) {
                            const message = error instanceof Error ? error.message : 'Could not upload image';
                            toast({ title: 'Upload failed', description: message });
                          }
                        }
                      }
                      if (itemId) {
                        const seenModifiers = new Set<string>();
                        for (const cm of customMods) {
                          if (!cm.titleEn.trim() && !cm.titleEl.trim()) continue;
                          let modifierId = cm.id;
                          if (modifierId) {
                            await api.updateModifier(modifierId, {
                              titleEn: cm.titleEn.trim(),
                              titleEl: cm.titleEl.trim(),
                              minSelect: cm.required ? 1 : 0,
                              maxSelect: null,
                              isAvailable: cm.isAvailable,
                            });
                          } else {
                            const createdModifier = await api.createModifier({
                              titleEn: cm.titleEn.trim(),
                              titleEl: cm.titleEl.trim(),
                              minSelect: cm.required ? 1 : 0,
                              maxSelect: null,
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
                      setModalOpen(false);
                    } finally {
                      setSavingItem(false);
                    }
                  }}
                  disabled={savingItem || !canSave}
                  className="inline-flex items-center gap-2"
                >
              {savingItem && <span className="h-4 w-4 border-2 border-current/60 border-t-transparent rounded-full animate-spin"/>}
                  Save
                </Button>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
