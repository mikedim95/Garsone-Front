import { MenuItem, Order, Table } from '../types';

export const COFFEE_IMAGES = [
  (import.meta.env.VITE_LOCAL_ONLY === 'true' ? '/offline-assets/682539cf56f506e5.webp' : 'https://d64gsuwffb70l.cloudfront.net/68ee65fda6db38e6a0062b32_1760454717302_f5c46fc1.webp'),
  (import.meta.env.VITE_LOCAL_ONLY === 'true' ? '/offline-assets/e29fda6687b6ec93.webp' : 'https://d64gsuwffb70l.cloudfront.net/68ee65fda6db38e6a0062b32_1760454719981_94cc5eba.webp'),
  (import.meta.env.VITE_LOCAL_ONLY === 'true' ? '/offline-assets/b83c699b4e7019e5.webp' : 'https://d64gsuwffb70l.cloudfront.net/68ee65fda6db38e6a0062b32_1760454722091_02e3c38a.webp'),
  (import.meta.env.VITE_LOCAL_ONLY === 'true' ? '/offline-assets/f5a1e96c8411da05.webp' : 'https://d64gsuwffb70l.cloudfront.net/68ee65fda6db38e6a0062b32_1760454724218_7f4b5792.webp'),
];

export const PASTRY_IMAGES = [
  (import.meta.env.VITE_LOCAL_ONLY === 'true' ? '/offline-assets/a91e8423eef57725.webp' : 'https://d64gsuwffb70l.cloudfront.net/68ee65fda6db38e6a0062b32_1760454209701_0c16b4a8.webp'),
  (import.meta.env.VITE_LOCAL_ONLY === 'true' ? '/offline-assets/f02124240723efa6.webp' : 'https://d64gsuwffb70l.cloudfront.net/68ee65fda6db38e6a0062b32_1760454212061_9d358689.webp'),
  (import.meta.env.VITE_LOCAL_ONLY === 'true' ? '/offline-assets/46e4b1e15da81a45.webp' : 'https://d64gsuwffb70l.cloudfront.net/68ee65fda6db38e6a0062b32_1760454214399_f43bd3ac.webp'),
  (import.meta.env.VITE_LOCAL_ONLY === 'true' ? '/offline-assets/2bd34b9c5baddf47.webp' : 'https://d64gsuwffb70l.cloudfront.net/68ee65fda6db38e6a0062b32_1760454216225_71f12398.webp'),
];

export const HERO_IMAGE = (import.meta.env.VITE_LOCAL_ONLY === 'true' ? '/placeholder.svg' : 'https://d64gsuwffb70l.cloudfront.net/68ee65fda6db38e6a0062b32_1760454714480_0ce820a0.webp');
export const QR_MOCKUP = (import.meta.env.VITE_LOCAL_ONLY === 'true' ? '/offline-assets/fece9ef42ad25530.webp' : 'https://d64gsuwffb70l.cloudfront.net/68ee65fda6db38e6a0062b32_1760454716012_22db1dcb.webp');

export const MOCK_MODIFIERS = {
  milk: {
    id: 'mod-milk',
    name: 'Milk',
    options: [
      { id: 'milk-whole', label: 'Whole milk', priceDelta: 0 },
      { id: 'milk-skim', label: 'Skim milk', priceDelta: 0 },
      { id: 'milk-oat', label: 'Oat milk', priceDelta: 0.3 },
      { id: 'milk-soy', label: 'Soy milk', priceDelta: 0.3 },
    ],
  },
  size: {
    id: 'mod-size',
    name: 'Size',
    options: [
      { id: 'size-s', label: 'Small', priceDelta: 0 },
      { id: 'size-m', label: 'Medium', priceDelta: 0.5 },
      { id: 'size-l', label: 'Large', priceDelta: 1.0 },
    ],
  },
};
