import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';
import type { ManagerItemSummary, ManagerItemPayload, MenuCategory, MenuData, Modifier, ModifierOption } from '@/types';
import { useToast } from '@/hooks/use-toast';

type CustomOption = { title: string; price: string };
type CustomModifier = { title: string; required: boolean; options: CustomOption[] };
type ItemForm = {
  title: string;
  description: string;
  imageUrl: string;
  price: string;
  categoryId: string;
  newCategoryTitle: string;
  isAvailable: boolean;
};
type EditableModifierOption = { id?: string; title: string; price: string };
type ModifierEditState = {
  id: string;
  title: string;
  required: boolean;
  options: EditableModifierOption[];
};

export const ManagerMenuPanel = () => {
  const { toast } = useToast();

  const [items, setItems] = useState<ManagerItemSummary[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);

  const [storeSlug, setStoreSlug] = useState<string>('demo-cafe');

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ManagerItemSummary | null>(null);
  const [form, setForm] = useState<ItemForm>({
    title: '',
    description: '',
    imageUrl: '',
    price: '0.00',
    categoryId: '',
    newCategoryTitle: '',
    isAvailable: true,
  });
  const [savingItem, setSavingItem] = useState(false);

  // Read-only modifiers for the currently editing item
  const [itemMods, setItemMods] = useState<Modifier[]>([]);

  // Per-item custom modifiers builder
  const [customMods, setCustomMods] = useState<CustomModifier[]>([]);

  // Edit existing modifier modal
  const [modEditOpen, setModEditOpen] = useState(false);
  const [modEditSaving, setModEditSaving] = useState(false);
  const [modEdit, setModEdit] = useState<ModifierEditState>({
    id: '',
    title: '',
    required: false,
    options: [],
  });
  const [modEditOriginalIds, setModEditOriginalIds] = useState<string[]>([]);

  // UI helpers
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [showDisabled, setShowDisabled] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');

  const load = useCallback(async () => {
    try {
      const [itemsRes, categoriesRes] = await Promise.all([api.listItems(), api.listCategories()]);
      setItems(itemsRes.items ?? []);
      setCategories(categoriesRes.categories ?? []);
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

  const openAdd = (prefCategoryId?: string) => {
    setEditing(null);
    const fallbackCategory = prefCategoryId || categories[0]?.id || '';
    setForm({
      title: '',
      description: '',
      imageUrl: '',
      price: '0.00',
      categoryId: fallbackCategory,
      newCategoryTitle: '',
      isAvailable: true,
    });
    setItemMods([]);
    setCustomMods([]);
    setModalOpen(true);
  };

  const openEdit = async (item: ManagerItemSummary) => {
    setEditing(item);
    setForm({
      title: item.title ?? item.name ?? '',
      description: item.description ?? '',
      imageUrl: item.image ?? item.imageUrl ?? '',
      price: typeof item.priceCents === 'number' ? (item.priceCents / 100).toFixed(2) : '0.00',
      categoryId: item.categoryId ?? '',
      newCategoryTitle: '',
      isAvailable: item.isAvailable ?? true,
    });
    try {
      const menu: MenuData = await api.getMenu();
      const found = menu.items.find((x) => x.id === item.id);
      setItemMods(found?.modifiers ?? []);
    } catch (error) {
      console.error('Failed to load item modifiers', error);
    }
    setCustomMods([]);
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
          <Button size="sm" className="gap-2" onClick={async ()=>{
            const title = window.prompt('Add new category');
            const t = (title || '').trim();
            if (!t) return;
            try {
              await api.createCategory(t);
              await load();
              toast({ title: 'Category added', description: t });
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Could not create category';
              toast({ title: 'Create failed', description: message });
            }
          }}><Plus className="h-4 w-4"/> Add Category</Button>
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
                <Button size="sm" variant="ghost" onClick={async ()=>{
                  const title = window.prompt('Rename category', cat.title);
                  if (!title || title.trim() === cat.title) return;
                  try {
                    await api.updateCategory(cat.id, { title: title.trim() });
                    await load();
                    toast({ title: 'Category renamed', description: title.trim() });
                  } catch (error) {
                    const message = error instanceof Error ? error.message : 'Could not rename category';
                    toast({ title: 'Rename failed', description: message });
                  }
                }}><Pencil className="h-4 w-4"/></Button>
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
                      {item.title ?? item.name}
                      <span className="text-xs text-muted-foreground">
                        €{((item.priceCents ?? 0) / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{item.description || '—'}</div>
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

      {/* Add/Edit Item */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Item' : 'Add Item'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <Input placeholder="Title" value={form.title} onChange={(e)=>setForm({...form, title: e.target.value})}/>
            <Textarea placeholder="Description" value={form.description} onChange={(e)=>setForm({...form, description: e.target.value})}/>
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

            {/* Read-only display of current item modifiers */}
            <div className="mt-3">
              <div className="text-sm font-medium mb-2">Modifiers</div>
              <div className="max-h-56 overflow-auto space-y-3 border rounded p-3">
                {itemMods.length === 0 && (
                  <div className="text-xs text-muted-foreground">No modifiers yet.</div>
                )}
                {itemMods.map((modifier)=> (
                  <div key={modifier.id} className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{modifier.name}{modifier.required ? ' (required)' : ''}</div>
                      <ul className="ml-4 text-sm text-muted-foreground list-disc">
                        {(modifier.options ?? []).map((option)=> (
                          <li key={option.id}>{option.label}{(option.priceDelta ?? 0) > 0 ? ` +€${(option.priceDelta).toFixed(2)}` : ''}</li>
                        ))}
                      </ul>
                    </div>
                    {editing && (
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => {
                          setModEdit({
                            id: modifier.id,
                            title: modifier.name ?? '',
                            required: !!modifier.required,
                            options: (modifier.options ?? []).map((option) => ({
                              id: option.id,
                              title: option.label,
                              price: ((option.priceDelta ?? 0)).toFixed(2),
                            })),
                          });
                          setModEditOriginalIds(
                            (modifier.options ?? [])
                              .map((option) => option.id ?? '')
                              .filter((id): id is string => Boolean(id))
                          );
                          setModEditOpen(true);
                        }}>Edit</Button>
                        <Button variant="destructive" size="sm" onClick={async ()=>{
                          const yes = window.confirm('Unlink this modifier from the item? You can optionally delete it if unused.');
                          if (!yes) return;
                          try {
                            await api.unlinkItemModifier(editing.id, modifier.id);
                            try {
                              await api.deleteModifier(modifier.id);
                            }
                            // eslint-disable-next-line no-empty -- best-effort cleanup; orphaned modifier is harmless
                            catch {}
                            setItemMods((prev) => prev.filter((existing) => existing.id !== modifier.id));
                            toast({ title: 'Modifier unlinked', description: modifier.name ?? '' });
                          } catch(error) {
                            const message = error instanceof Error ? error.message : 'Could not unlink modifier';
                            toast({ title: 'Failed', description: message });
                          }
                        }}><Trash2 className="h-4 w-4"/></Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Custom modifiers builder */}
            <div className="mt-6">
              <div className="text-sm font-medium mb-2">Custom modifiers for this item</div>
              <div className="space-y-4">
                {customMods.map((cm, idx) => (
                  <div key={idx} className="border rounded p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Input placeholder="Modifier title (e.g., Milk, Size)" value={cm.title} onChange={(e)=>{
                        const v=e.target.value; setCustomMods(mods=>mods.map((m,i)=> i===idx? { ...m, title: v}: m));
                      }}/>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={cm.required} onChange={(e)=>{
                          const v=e.target.checked; setCustomMods(mods=>mods.map((m,i)=> i===idx? { ...m, required: v}: m));
                        }}/>
                        required
                      </label>
                    </div>
                    <div className="space-y-2">
                      {cm.options.map((opt, oi) => (
                        <div key={oi} className="grid grid-cols-2 gap-2">
                          <Input placeholder="Option label (e.g., Oat)" value={opt.title} onChange={(e)=>{
                            const v=e.target.value; setCustomMods(mods=>mods.map((m,i)=> i===idx? { ...m, options: m.options.map((o,j)=> j===oi? { ...o, title: v}: o)}: m));
                          }}/>
                          <Input placeholder="Price +€ (e.g., 0.50)" type="number" min={0} step={0.01} value={opt.price} onChange={(e)=>{
                            const v=e.target.value; setCustomMods(mods=>mods.map((m,i)=> i===idx? { ...m, options: m.options.map((o,j)=> j===oi? { ...o, price: v}: o)}: m));
                          }}/>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" onClick={()=> setCustomMods(mods=>mods.map((m,i)=> i===idx? { ...m, options: [...m.options, { title:'', price:''}] }: m))}>+ Option</Button>
                      <Button size="sm" variant="outline" onClick={()=> setCustomMods(mods=>mods.filter((_,i)=> i!==idx))}>Remove modifier</Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button size="sm" className="mt-2" variant="outline" onClick={()=> setCustomMods(mods=>[...mods, { title:'', required:false, options:[{ title:'', price:''}] }])}>+ Add custom modifier</Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={()=>setModalOpen(false)}>Cancel</Button>
            {(() => {
              const priceNum = parseFloat(form.price || '');
              const modifierMissingTitle = customMods.some((cm) => cm.options.length > 0 && !cm.title.trim());
              const modifierMissingOptionLabel = customMods.some((cm) =>
                cm.options.some((opt) => !opt.title.trim())
              );
              const hasModifierValidationError = modifierMissingTitle || modifierMissingOptionLabel;
              const canSave = form.title.trim().length > 0 && Number.isFinite(priceNum) && !hasModifierValidationError;
              return (
                <Button
                  onClick={async ()=>{
                    if (!canSave) return;
                    setSavingItem(true);
                    try {
                      const categoryId = form.categoryId;
                      if (!categoryId) return;
                      const payload: ManagerItemPayload = {
                        title: form.title.trim(),
                        description: form.description,
                        priceCents: Math.round((parseFloat(form.price || '0') || 0) * 100),
                        categoryId,
                        isAvailable: form.isAvailable,
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
                        for (const cm of customMods) {
                          if (!cm.title.trim()) continue;
                          const createdModifier = await api.createModifier({
                            title: cm.title,
                            minSelect: cm.required ? 1 : 0,
                            maxSelect: null,
                          });
                          const modifierId = createdModifier.modifier.id;
                          let index = 0;
                          for (const opt of cm.options) {
                            if (!opt.title.trim()) continue;
                            const priceCents = Math.round((parseFloat(opt.price || '0') || 0) * 100);
                            await api.createModifierOption({
                              modifierId,
                              title: opt.title,
                              priceDeltaCents: priceCents,
                              sortOrder: index++,
                            });
                          }
                          await api.linkItemModifier(itemId, modifierId, cm.required);
                        }
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
      {/* Edit existing modifier for this item */}
      <Dialog open={modEditOpen} onOpenChange={setModEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Modifier</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input placeholder="Modifier title" value={modEdit.title} onChange={(e)=>setModEdit({...modEdit, title: e.target.value})} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={modEdit.required} onChange={(e)=>setModEdit({...modEdit, required: e.target.checked})}/>
                required
              </label>
            </div>
            <div className="space-y-2">
              {modEdit.options.map((opt, idx) => (
                <div key={idx} className="grid grid-cols-5 gap-2 items-center">
                  <Input className="col-span-2" placeholder="Option label" value={opt.title} onChange={(e)=>{
                    const v=e.target.value; setModEdit(me=>({ ...me, options: me.options.map((o,i)=> i===idx? { ...o, title: v }: o) }));
                  }}/>
                  <Input placeholder="Price +€" type="number" min={0} step={0.01} value={opt.price} onChange={(e)=>{
                    const v=e.target.value; setModEdit(me=>({ ...me, options: me.options.map((o,i)=> i===idx? { ...o, price: v }: o) }));
                  }}/>
                  <div className="flex gap-1 justify-end">
                    <Button variant="outline" size="sm" onClick={()=> setModEdit(me=>{
                      if (idx<=0) return me; const arr=[...me.options]; const t=arr[idx-1]; arr[idx-1]=arr[idx]; arr[idx]=t; return {...me, options: arr};
                    })}><ArrowUp className="h-4 w-4"/></Button>
                    <Button variant="outline" size="sm" onClick={()=> setModEdit(me=>{
                      if (idx>=me.options.length-1) return me; const arr=[...me.options]; const t=arr[idx+1]; arr[idx+1]=arr[idx]; arr[idx]=t; return {...me, options: arr};
                    })}><ArrowDown className="h-4 w-4"/></Button>
                    <Button variant="outline" size="sm" onClick={()=> setModEdit(me=>({ ...me, options: me.options.filter((_,i)=> i!==idx) }))}>Remove</Button>
                  </div>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={()=> setModEdit(me=>({ ...me, options: [...me.options, { title:'', price:'' }] }))}>+ Option</Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={()=>setModEditOpen(false)}>Cancel</Button>
            <Button disabled={modEditSaving} className="inline-flex items-center gap-2" onClick={async ()=>{
              if (!editing) return;
              setModEditSaving(true);
              try {
                await api.updateModifier(modEdit.id, { title: modEdit.title, minSelect: modEdit.required ? 1 : 0, maxSelect: null });
                await api.linkItemModifier(editing.id, modEdit.id, modEdit.required);
                // Options: update/create
                const keep = new Set<string>();
                for (let i=0;i<modEdit.options.length;i++) {
                  const o = modEdit.options[i];
                  const priceCents = Math.round(parseFloat(o.price||'0')*100) || 0;
                  if (o.id) {
                    keep.add(o.id);
                    await api.updateModifierOption(o.id, { title: o.title, priceDeltaCents: priceCents, sortOrder: i });
                  } else {
                    const created = await api.createModifierOption({ modifierId: modEdit.id, title: o.title, priceDeltaCents: priceCents, sortOrder: i });
                    keep.add(created.option.id);
                  }
                }
                // Delete removed options
                for (const oid of modEditOriginalIds) {
                  if (!keep.has(oid)) await api.deleteModifierOption(oid);
                }
                // Refresh item modifiers view
                try {
                  const menu = await api.getMenu();
                  const found = menu.items.find((x)=>x.id===editing.id);
                  setItemMods(found?.modifiers ?? []);
                } catch (error) {
                  console.warn('Failed to refresh modifiers', error);
                }
                setModEditOpen(false);
              } finally {
                setModEditSaving(false);
              }
            }}>
              {modEditSaving && <span className="h-4 w-4 border-2 border-current/60 border-t-transparent rounded-full animate-spin"/>}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
