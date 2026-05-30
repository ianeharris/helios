export type SlotType = 'cheap' | 'standard';

export interface TariffSlot {
  start: string;       // ISO8601 UTC
  end: string | null;  // ISO8601 UTC; null means open-ended (current active slot)
  type: SlotType;
  ratePenceIncVat: number;
}

export interface TariffState {
  currentType: SlotType;
  currentRatePenceIncVat: number;
  validTo: string | null;       // when current slot ends; null = open-ended
  exportRatePenceIncVat: number;
  slots: TariffSlot[];          // import slots for the next 48 hours
  updatedAt: string;            // ISO8601 UTC
}

// Octopus REST API shapes
export interface OctopusRateResult {
  value_exc_vat: number;
  value_inc_vat: number;
  valid_from: string;
  valid_to: string | null;
  payment_method: string | null;
}

export interface OctopusRatesResponse {
  count: number;
  next: string | null;
  results: OctopusRateResult[];
}
