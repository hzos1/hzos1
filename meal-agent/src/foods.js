import { readFileSync } from "node:fs";

const table = JSON.parse(readFileSync(new URL("../data/foods.json", import.meta.url), "utf8"));
const recognition = JSON.parse(readFileSync(new URL("../data/recognition-map.json", import.meta.url), "utf8"));

export const FOODS = table.foods;

const byId = new Map(FOODS.map((food) => [food.id, food]));

export function scale(per100, grams) {
  if (per100 == null || Number.isNaN(Number(per100))) return null;
  return Math.round((Number(per100) * Number(grams) / 100) * 10) / 10;
}

export function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

export function nutrientsFor(food, grams) {
  const row = food.per100g;
  return {
    energyKcal: scale(row.energyKcal, grams),
    proteinG: scale(row.proteinG, grams),
    carbohydrateG: scale(row.carbohydrateG, grams),
    fatG: scale(row.fatG, grams),
    sodiumMg: row.sodiumMg == null ? null : scale(row.sodiumMg, grams),
  };
}

export function normalizeName(value) {
  return String(value || "").trim().toLowerCase().replaceAll("_", " ").replace(/\s+/g, " ");
}

export function foodById(id) {
  return byId.get(id) || null;
}

export function lookupFood(query) {
  const key = normalizeName(query);
  if (!key) return { status: "missing", query };
  const exact = FOODS.filter((food) => {
    const names = [food.name, food.nameEn, ...(food.aliases || [])].filter(Boolean).map(normalizeName);
    return names.includes(key);
  });
  if (exact.length === 1) return { status: "found", food: exact[0] };
  if (exact.length > 1) return { status: "ambiguous", foods: exact };

  const contained = FOODS.filter((food) => {
    const names = [food.name, ...(food.aliases || [])].filter(Boolean).map(normalizeName);
    return names.some((name) => name.length >= 2 && key.includes(name));
  }).sort((a, b) => Math.max(...b.aliases.map((item) => item.length), b.name.length) - Math.max(...a.aliases.map((item) => item.length), a.name.length));
  if (contained.length === 0) return { status: "missing", query };
  const winnerLength = Math.max(contained[0].name.length, ...contained[0].aliases.map((item) => item.length));
  const winners = contained.filter((food) => Math.max(food.name.length, ...food.aliases.map((item) => item.length)) === winnerLength);
  const ids = new Set(winners.map((food) => food.id));
  if (ids.size > 1) return { status: "ambiguous", foods: winners };
  return { status: "found", food: winners[0] };
}

export function proposalForLabel(label) {
  const key = String(label || "").trim().toLowerCase();
  const mapped = recognition.map[key];
  if (!mapped) return null;
  const food = foodById(mapped.foodId);
  if (!food) return null;
  return { foodId: food.id, name: food.name, exact: mapped.exact, sourceId: food.sourceId };
}

export async function lookupUsdaLive(query, apiKey, fetchImpl = fetch) {
  if (!apiKey) return { status: "unavailable", reason: "FDC_API_KEY is not set" };
  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("query", query);
  url.searchParams.set("dataType", "Foundation,SR Legacy");
  url.searchParams.set("pageSize", "3");
  const response = await fetchImpl(url);
  if (!response.ok) return { status: "error", reason: `USDA HTTP ${response.status}` };
  const body = await response.json();
  const food = (body.foods || []).find((item) => (item.foodNutrients || []).some((nutrient) => nutrient.nutrientId === 1008 && nutrient.unitName === "KCAL"));
  if (!food) return { status: "missing", query };
  const pick = (id) => (food.foodNutrients || []).find((nutrient) => nutrient.nutrientId === id);
  const energy = pick(1008);
  if (!energy || energy.value == null) return { status: "missing", query };
  return {
    status: "found",
    food: {
      id: `usda-live:${food.fdcId}`,
      source: "usda-fdc-api",
      sourceId: String(food.fdcId),
      name: food.description,
      aliases: [],
      per100g: {
        energyKcal: Number(energy.value),
        proteinG: pick(1003)?.value == null ? null : Number(pick(1003).value),
        fatG: pick(1004)?.value == null ? null : Number(pick(1004).value),
        carbohydrateG: pick(1005)?.value == null ? null : Number(pick(1005).value),
        sodiumMg: pick(1093)?.value == null ? null : Number(pick(1093).value),
      },
      state: food.dataType || "",
      group: "unknown",
      produce: false,
      starchyRoot: false,
      avoid: [],
      cuisine: [],
      portions: [],
      dataset: "USDA FoodData Central API search",
      datasetUrl: "https://fdc.nal.usda.gov/api-guide/",
      license: "CC0 1.0",
    },
  };
}
