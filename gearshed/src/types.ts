export const GEAR_CATEGORIES = [
  'shelter',
  'sleep',
  'kitchen',
  'water',
  'lighting',
  'tools',
  'recovery',
  'electronics',
  'clothing',
  'safety',
  'storage',
  'furniture',
  'other',
] as const;

export type GearCategory = (typeof GEAR_CATEGORIES)[number];

/** Normalized bounding box, all values 0..1 relative to the source image. */
export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A gear item detected by AI in a photo, before the user curates it. */
export interface DetectedItem {
  name: string;
  category: GearCategory;
  brandGuess: string | null;
  confidence: number;
  box: BoundingBox;
}

export interface DetectionResult {
  items: DetectedItem[];
  sceneSummary: string;
}

/** A gear item in the user's inventory. */
export interface GearItem {
  id: string;
  name: string;
  category: GearCategory;
  brand?: string;
  quantity: number;
  rating: number; // 0 (unrated) to 5
  notes: string;
  weightGrams?: number;
  photoUri?: string;
  box?: BoundingBox;
  source: 'scan' | 'manual';
  createdAt: number;
}

export interface PackingListItem {
  gearId: string;
  packed: boolean;
}

export interface PackingList {
  id: string;
  name: string;
  tripType: TripType;
  items: PackingListItem[];
  createdAt: number;
}

export const TRIP_TYPES = ['car-camping', 'overlanding', 'backpacking', 'custom'] as const;
export type TripType = (typeof TRIP_TYPES)[number];

/** Categories auto-selected when generating a packing list for a trip type. */
export const TRIP_CATEGORY_PRESETS: Record<TripType, GearCategory[]> = {
  'car-camping': ['shelter', 'sleep', 'kitchen', 'water', 'lighting', 'furniture', 'safety'],
  overlanding: [
    'shelter',
    'sleep',
    'kitchen',
    'water',
    'lighting',
    'tools',
    'recovery',
    'electronics',
    'safety',
    'storage',
  ],
  backpacking: ['shelter', 'sleep', 'kitchen', 'water', 'lighting', 'safety', 'clothing'],
  custom: [],
};

export interface Settings {
  anthropicApiKey: string;
  amazonAffiliateTag: string;
  mockMode: boolean;
}

export function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
