/** Shared micronutrient keys for vision AI + editable UI. */
export const MICRO_KEYS = [
  "sodiumMg",
  "calciumMg",
  "ironMg",
  "potassiumMg",
  "magnesiumMg",
  "zincMg",
  "phosphorusMg",
  "vitaminAUcg",
  "vitaminCMg",
  "vitaminDUcg",
  "vitaminB12Ucg",
  "folateUcg",
  "fiberG",
];

export function emptyMicros() {
  return Object.fromEntries(MICRO_KEYS.map((key) => [key, null]));
}

export function pickMicros(source, num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}) {
  const out = emptyMicros();
  if (!source || typeof source !== "object") return out;
  const nested = source.micros && typeof source.micros === "object" ? source.micros : {};
  for (const key of MICRO_KEYS) {
    out[key] = num(source[key] ?? nested[key]);
  }
  return out;
}

export function scaleMicros(micros, factor) {
  const out = emptyMicros();
  if (!micros || typeof micros !== "object") return out;
  for (const key of MICRO_KEYS) {
    const value = micros[key];
    out[key] = value == null ? null : Math.round(Number(value) * factor * 10) / 10;
  }
  return out;
}
