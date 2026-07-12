import { DetectionResult } from './types';

export type RootStackParamList = {
  Tabs: undefined;
  GearDetail: { gearId: string };
  ReviewDetections: {
    photoUri: string;
    photoWidth: number;
    photoHeight: number;
    result: DetectionResult;
  };
  PackingListDetail: { listId: string };
};

export type TabParamList = {
  Inventory: undefined;
  Scan: undefined;
  Packing: undefined;
  Settings: undefined;
};
