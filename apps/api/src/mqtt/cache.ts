const store = new Map<string, unknown>();

export const mqttSet = (topic: string, payload: Buffer): void => {
  try {
    store.set(topic, JSON.parse(payload.toString()));
  } catch {
    store.set(topic, payload.toString());
  }
};

export const mqttGet = <T>(topic: string): T | null =>
  (store.get(topic) as T) ?? null;
