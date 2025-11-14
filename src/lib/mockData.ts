import { MenuItem, Order, Table } from '../types';

export const COFFEE_IMAGES = [
  'https://d64gsuwffb70l.cloudfront.net/68ee65fda6db38e6a0062b32_1760454717302_f5c46fc1.webp',
  'https://d64gsuwffb70l.cloudfront.net/68ee65fda6db38e6a0062b32_1760454719981_94cc5eba.webp',
  'https://d64gsuwffb70l.cloudfront.net/68ee65fda6db38e6a0062b32_1760454722091_02e3c38a.webp',
  'https://d64gsuwffb70l.cloudfront.net/68ee65fda6db38e6a0062b32_1760454724218_7f4b5792.webp',
];

export const PASTRY_IMAGES = [
  'https://d64gsuwffb70l.cloudfront.net/68ee65fda6db38e6a0062b32_1760454209701_0c16b4a8.webp',
  'https://d64gsuwffb70l.cloudfront.net/68ee65fda6db38e6a0062b32_1760454212061_9d358689.webp',
  'https://d64gsuwffb70l.cloudfront.net/68ee65fda6db38e6a0062b32_1760454214399_f43bd3ac.webp',
  'https://d64gsuwffb70l.cloudfront.net/68ee65fda6db38e6a0062b32_1760454216225_71f12398.webp',
];

export const HERO_IMAGE = 'https://d64gsuwffb70l.cloudfront.net/68ee65fda6db38e6a0062b32_1760454714480_0ce820a0.webp';
export const QR_MOCKUP = 'https://d64gsuwffb70l.cloudfront.net/68ee65fda6db38e6a0062b32_1760454716012_22db1dcb.webp';

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
