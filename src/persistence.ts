export const STORAGE_KEY = 'ejm-fly:v1';
export const VERSION = 1;
const finite = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export type MemorySound = { enabled: boolean; volume: number };
export type MemoryFraming = { yaw: number; pitch: number; distance: number };
export type MemoryFlight = {
  position: [number, number, number];
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  time: number;
};
export type Memory = {
  version: number;
  seed: number;
  sound: MemorySound;
  framing: MemoryFraming;
  flight: MemoryFlight;
};

export type MemoryStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function validateMemory(value: unknown): Memory | null {
  if (!record(value) || value.version !== VERSION) return null;
  const { seed, sound, framing, flight } = value;
  if (!Number.isInteger(seed) || !finite(seed, 0, 0xffffffff)) return null;
  if (!record(sound) || typeof sound.enabled !== 'boolean' || !finite(sound.volume, 0, 1)) return null;
  if (!record(framing) || !finite(framing.yaw, -1e6, 1e6) || !finite(framing.pitch, -1.2, 1.2) || !finite(framing.distance, 2, 120)) return null;
  if (!record(flight) || !Array.isArray(flight.position) || flight.position.length !== 3 ||
      !flight.position.every((n: unknown) => finite(n, -1e9, 1e9)) || !finite(flight.yaw, -Math.PI, Math.PI) ||
      !finite(flight.pitch, -0.85, 0.85) || !finite(flight.roll, -0.5, 0.5) ||
      !finite(flight.speed, 0, 100) || !finite(flight.time, 0, 1e12)) return null;
  return { version: VERSION, seed: seed as number, sound: { enabled: sound.enabled as boolean, volume: sound.volume as number },
    framing: { yaw: framing.yaw as number, pitch: framing.pitch as number, distance: framing.distance as number },
    flight: { position: [...flight.position] as [number, number, number], yaw: flight.yaw as number, pitch: flight.pitch as number, roll: flight.roll as number, speed: flight.speed as number, time: flight.time as number } };
}

export function loadMemory(storage: MemoryStorage): Memory | null {
  try { return validateMemory(JSON.parse(storage.getItem(STORAGE_KEY) as string)); } catch { return null; }
}

export function saveMemory(storage: MemoryStorage, value: unknown): boolean {
  try {
    const valid = validateMemory(value);
    if (!valid) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(valid));
    return true;
  } catch { return false; }
}
