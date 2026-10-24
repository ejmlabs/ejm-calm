export const STORAGE_KEY = 'ejm-fly:v1';
export const VERSION = 1;
const finite = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateMemory(value) {
  if (!record(value) || value.version !== VERSION) return null;
  const { seed, sound, framing, flight } = value;
  if (!Number.isInteger(seed) || !finite(seed, 0, 0xffffffff)) return null;
  if (!record(sound) || typeof sound.enabled !== 'boolean' || !finite(sound.volume, 0, 1)) return null;
  if (!record(framing) || !finite(framing.yaw, -1e6, 1e6) || !finite(framing.pitch, -1.2, 1.2) || !finite(framing.distance, 2, 120)) return null;
  if (!record(flight) || !Array.isArray(flight.position) || flight.position.length !== 3 ||
      !flight.position.every((n) => finite(n, -1e9, 1e9)) || !finite(flight.yaw, -Math.PI, Math.PI) ||
      !finite(flight.pitch, -0.85, 0.85) || !finite(flight.roll, -0.5, 0.5) ||
      !finite(flight.speed, 0, 100) || !finite(flight.time, 0, 1e12)) return null;
  return { version: VERSION, seed, sound: { enabled: sound.enabled, volume: sound.volume },
    framing: { yaw: framing.yaw, pitch: framing.pitch, distance: framing.distance },
    flight: { position: [...flight.position], yaw: flight.yaw, pitch: flight.pitch, roll: flight.roll, speed: flight.speed, time: flight.time } };
}

export function loadMemory(storage) {
  try { return validateMemory(JSON.parse(storage.getItem(STORAGE_KEY))); } catch { return null; }
}

export function saveMemory(storage, value) {
  try {
    const valid = validateMemory(value);
    if (!valid) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(valid));
    return true;
  } catch { return false; }
}
