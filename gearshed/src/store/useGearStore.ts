import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  GearItem,
  PackingList,
  Settings,
  TripType,
  TRIP_CATEGORY_PRESETS,
  makeId,
} from '../types';

interface GearState {
  items: GearItem[];
  packingLists: PackingList[];
  settings: Settings;

  addItems: (items: GearItem[]) => void;
  updateItem: (id: string, patch: Partial<GearItem>) => void;
  removeItem: (id: string) => void;

  createPackingList: (name: string, tripType: TripType) => string;
  removePackingList: (id: string) => void;
  togglePacked: (listId: string, gearId: string) => void;
  toggleListItem: (listId: string, gearId: string) => void;

  updateSettings: (patch: Partial<Settings>) => void;
  resetAll: () => void;
}

const DEFAULT_SETTINGS: Settings = {
  anthropicApiKey: '',
  amazonAffiliateTag: '',
  mockMode: true,
};

export const useGearStore = create<GearState>()(
  persist(
    (set, get) => ({
      items: [],
      packingLists: [],
      settings: DEFAULT_SETTINGS,

      addItems: (items) => set((s) => ({ items: [...items, ...s.items] })),

      updateItem: (id, patch) =>
        set((s) => ({
          items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
        })),

      removeItem: (id) =>
        set((s) => ({
          items: s.items.filter((it) => it.id !== id),
          packingLists: s.packingLists.map((pl) => ({
            ...pl,
            items: pl.items.filter((li) => li.gearId !== id),
          })),
        })),

      createPackingList: (name, tripType) => {
        const id = makeId();
        const categories = TRIP_CATEGORY_PRESETS[tripType];
        const autoItems = get()
          .items.filter((it) => categories.includes(it.category))
          .map((it) => ({ gearId: it.id, packed: false }));
        const list: PackingList = {
          id,
          name,
          tripType,
          items: autoItems,
          createdAt: Date.now(),
        };
        set((s) => ({ packingLists: [list, ...s.packingLists] }));
        return id;
      },

      removePackingList: (id) =>
        set((s) => ({ packingLists: s.packingLists.filter((pl) => pl.id !== id) })),

      togglePacked: (listId, gearId) =>
        set((s) => ({
          packingLists: s.packingLists.map((pl) =>
            pl.id === listId
              ? {
                  ...pl,
                  items: pl.items.map((li) =>
                    li.gearId === gearId ? { ...li, packed: !li.packed } : li,
                  ),
                }
              : pl,
          ),
        })),

      // Add or remove a gear item from a packing list.
      toggleListItem: (listId, gearId) =>
        set((s) => ({
          packingLists: s.packingLists.map((pl) => {
            if (pl.id !== listId) return pl;
            const exists = pl.items.some((li) => li.gearId === gearId);
            return {
              ...pl,
              items: exists
                ? pl.items.filter((li) => li.gearId !== gearId)
                : [...pl.items, { gearId, packed: false }],
            };
          }),
        })),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      resetAll: () =>
        set({ items: [], packingLists: [], settings: { ...get().settings } }),
    }),
    {
      name: 'gearshed-store',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
