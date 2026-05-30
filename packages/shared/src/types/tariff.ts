export type SlotType = 'cheap' | 'standard';

export interface TariffSlot {
  start: string;       // ISO8601 UTC
  end: string | null;  // ISO8601 UTC; null = open-ended
  type: SlotType;
  ratePenceIncVat: number;
}

export interface TariffState {
  currentType: SlotType;
  currentRatePenceIncVat: number;
  validTo: string | null;
  exportRatePenceIncVat: number;
  slots: TariffSlot[];
  updatedAt: string;
}
