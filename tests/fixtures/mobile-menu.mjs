// Synthetic long-content fixtures only. No venue exports or production credentials.
export const mobileTableId = '11111111-1111-4111-8111-111111111111';
export const mobileOrderId = '44444444-4444-4444-8444-444444444444';
export const mobileStore = {
  id: '55555555-5555-4555-8555-555555555555', slug: 'test-venue',
  name: 'Garden House — Κήπος και Καφές', orderingMode: 'qr', customerOrderRecallEnabled: true,
};
const categoryNames = [
  ['Coffee and handmade seasonal drinks', 'Καφέδες και χειροποίητα εποχιακά ροφήματα'],
  ['Fresh breakfast and brunch', 'Πρωινό και φρεσκομαγειρεμένο brunch'],
  ['Seasonal salads and sharing plates', 'Εποχιακές σαλάτες και πιάτα για τη μέση'],
  ['Desserts and refreshing cocktails', 'Γλυκά και δροσιστικά κοκτέιλ'],
];
const swatches = ['#e8c4a3', '#a9bc94', '#d4a3aa', '#beadd2'];
const photo = index => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><defs><linearGradient id="g"><stop stop-color="${swatches[index % 4]}"/><stop offset="1" stop-color="#3f3430"/></linearGradient></defs><rect width="640" height="480" fill="url(#g)"/><ellipse cx="320" cy="300" rx="145" ry="65" fill="#efe7dd"/><ellipse cx="320" cy="210" rx="95" ry="75" fill="#f5eee5"/><ellipse cx="320" cy="195" rx="74" ry="47" fill="#694835"/></svg>`)}`;

export function mobileFixture(language = 'en') {
  const categories = categoryNames.map(([en, el], index) => ({
    id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`,
    title: language === 'el' ? el : en, titleEn: en, titleEl: el, imageUrl: photo(index),
  }));
  const items = categories.flatMap((category, categoryIndex) => Array.from({ length: 8 }, (_, index) => ({
    id: `33333333-3333-4333-8333-${String(categoryIndex * 8 + index + 1).padStart(12, '0')}`,
    categoryId: category.id,
    titleEn: `${index + 1}. Handmade ${categoryIndex ? 'garden plate' : 'iced cappuccino'} with caramel and toasted hazelnut`,
    titleEl: `${index + 1}. Χειροποίητο ${categoryIndex ? 'πιάτο του κήπου' : 'παγωμένο καπουτσίνο'} με καραμέλα και καβουρδισμένο φουντούκι`,
    descriptionEn: 'Prepared fresh with seasonal ingredients. Ask our team about allergens and available alternatives.',
    descriptionEl: 'Παρασκευάζεται φρέσκο με εποχιακά υλικά. Ρωτήστε την ομάδα μας για αλλεργιογόνα και διαθέσιμες εναλλακτικές.',
    priceCents: 480 + index * 135, imageUrl: photo(categoryIndex), isAvailable: true, available: true, modifiers: [],
  }))).map(item => ({ ...item, title: language === 'el' ? item.titleEl : item.titleEn,
    name: language === 'el' ? item.titleEl : item.titleEn, image: item.imageUrl, price: item.priceCents / 100 }));
  items[7].modifiers = [{ id: 'long-flavours', required: true, minSelect: 1, maxSelect: 2,
    name: language === 'el' ? 'Επιλέξτε τα αγαπημένα σας χειροποίητα συνοδευτικά και εποχιακές γεύσεις' : 'Choose your favourite handmade extras and seasonal flavours',
    options: Array.from({ length: 14 }, (_, index) => ({ id: `extra-${index}`, priceDeltaCents: index * 25,
      label: language === 'el' ? `${index + 1}. Χειροποίητη καραμέλα με καβουρδισμένο φουντούκι και άρωμα βανίλιας` : `${index + 1}. Handmade caramel with toasted hazelnut and vanilla flavour` })) }];
  const cart = items.slice(0, 8).map((item, index) => ({ item, quantity: index % 2 + 1, selectedModifiers: {} }));
  const totalCents = cart.reduce((total, entry) => total + entry.item.priceCents * entry.quantity, 0);
  const order = { id: mobileOrderId, tableId: mobileTableId, tableLabel: '12 — Garden / Κήπος', status: 'PLACED',
    totalCents, total: totalCents / 100, createdAt: new Date().toISOString(),
    note: language === 'el' ? 'Παρακαλούμε φέρτε ξεχωριστά ποτήρια για όλους τους καλεσμένους.' : 'Please bring separate glasses for every guest at our table.',
    items: cart.map((entry, index) => ({ id: `line-${index}`, itemId: entry.item.id, title: entry.item.title,
      quantity: entry.quantity, unitPriceCents: entry.item.priceCents, modifiers: [] })),
  };
  return { categories, items, cart, order, bootstrap: {
    store: mobileStore, table: { id: mobileTableId, label: order.tableLabel },
    menu: { categories, items, modifiers: [], itemModifiers: [] },
  } };
}

export async function installMobileFixture(page, origin, fixture, unexpected) {
  if (page.routeWebSocket) await page.routeWebSocket('**/events/ws*', ws => ws.close());
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.protocol === 'data:') return route.continue();
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    if (url.origin !== origin) { unexpected.push(request.url()); return route.abort(); }
    const path = url.pathname.replace(/^\/api/, '');
    let body;
    if (path === '/public/menu-bootstrap') body = fixture.bootstrap;
    else if (path === '/store') body = { store: mobileStore, meta: { currencyCode: 'EUR', locale: 'en' } };
    else if (path === `/public/table/${mobileTableId}`) body = { tableId: mobileTableId, tableLabel: fixture.order.tableLabel, storeSlug: mobileStore.slug, storeName: mobileStore.name };
    else if (path === `/public/table/${mobileTableId}/orders`) body = { orders: [fixture.order] };
    else if (path === '/orders/queue') body = { ahead: 1 };
    else if (path === `/public/orders/${mobileOrderId}/summary`) body = { queuePosition: 1, estimatedMinutes: 8 };
    else if (path === '/public/push/key') body = { enabled: false, publicKey: null };
    else if (path === '/public/events' || path === '/call-waiter') body = { ok: true };
    else { unexpected.push(`${request.method()} ${path}`); return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"UNEXPECTED_MOCK_REQUEST"}' }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}
