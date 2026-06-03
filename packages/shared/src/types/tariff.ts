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

export interface DispatchSlot {
  start_utc: string;
  end_utc: string;
  delta_kwh: number;
  source: string;
}

export interface DispatchSchedule {
  account: string;
  fetched_at: string;
  slots: DispatchSlot[];
}

export interface SavingSessionEvent {
  id: string;       // event code
  name: string;
  start_at: string;
  end_at: string;
  joined: boolean;  // isEventParticipant
}

export interface SavingSessionState {
  active: boolean;
  events: SavingSessionEvent[];
  fetched_at: string;
}
